import re
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from sqlmodel import Session, func, select

from ..core.database import get_session
from ..core.deps import get_current_user, partner_feature_enabled, require_admin
from ..core.security import hash_password
from ..models import (
    CV,
    Community,
    Lesson,
    LessonProgress,
    LearningProfile,
    Partner,
    PartnerAssessment,
    PartnerAssessmentAttempt,
    PartnerMember,
    Project,
    Roadmap,
    User,
)

router = APIRouter()

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
VALID_MODES = {"doctor_assigned", "student_discovery"}
VALID_TYPES = {"school", "university", "educational_institution", "training_center", "other"}
VALID_PLANS = {"STARTER", "PRO", "PRIME"}
VALID_FEATURES = {
    "learning", "statistics", "community", "projects", "cv", "portfolio",
    "career", "certificates",
}
DEFAULT_FEATURES = {
    "STARTER": {"learning": True},
    "PRO": {"learning": True, "statistics": True, "projects": True},
    "PRIME": {
        "learning": True, "statistics": True, "community": True, "projects": True,
        "cv": True, "portfolio": True, "career": True, "certificates": True,
    },
}
HEADER_ALIASES = {
    "full_name": {"full name", "name", "student name", "الاسم", "الاسم الكامل", "اسم الطالب"},
    "email": {"email", "e-mail", "البريد", "البريد الإلكتروني", "الايميل", "الإيميل"},
    "username": {"username", "user name", "اسم المستخدم"},
    "password": {"password", "كلمة المرور", "كلمه المرور"},
    "national_id": {"national id", "national_id", "id number", "الرقم القومي", "رقم الهوية"},
    "phone": {"phone", "phone number", "mobile", "رقم الهاتف", "الهاتف", "رقم الموبايل"},
}


def _clean(value):
    return str(value or "").strip()


def _public_learning_mode(partner: Partner):
    return "student_discovery" if partner.learning_mode == "student_discovery" else "doctor_assigned"


def _doctor_track_config(partner: Partner):
    config = partner.doctor_track if isinstance(partner.doctor_track, dict) else {}
    if not _clean(config.get("track")) and partner.learning_mode == "admin_assigned":
        return {**config, "track": _clean(partner.assigned_track)}
    return config


def _migrate_legacy_assigned_track(partner: Partner):
    config = partner.doctor_track if isinstance(partner.doctor_track, dict) else {}
    if partner.learning_mode == "admin_assigned" and not _clean(config.get("track")) and _clean(partner.assigned_track):
        partner.doctor_track = {
            **config,
            "track": _clean(partner.assigned_track),
            "skills": config.get("skills", []),
            "topics": config.get("topics", []),
            "instructions": config.get("instructions", ""),
        }


def _partner_dict(partner: Partner, account: User, member_count: int = 0, doctor_count: int = 0):
    return {
        "id": partner.id,
        "name": partner.name,
        "institution_type": partner.institution_type,
        "status": partner.status,
        "learning_mode": _public_learning_mode(partner),
        "doctor_track": _doctor_track_config(partner),
        "subscription_plan": partner.subscription_plan,
        "subscription_status": partner.subscription_status,
        "subscription_start": partner.subscription_start.isoformat() if partner.subscription_start else None,
        "subscription_expires": partner.subscription_expires.isoformat() if partner.subscription_expires else None,
        "max_students": partner.max_students,
        "features": partner.features or DEFAULT_FEATURES.get(partner.subscription_plan, {}),
        "email": account.email,
        "full_name": account.full_name,
        "student_count": member_count,
        "doctor_count": doctor_count,
        "created_date": partner.created_date.isoformat() if partner.created_date else None,
    }


def _partner_context(user: User, session: Session):
    if user.role == "partner":
        partner = session.exec(
            select(Partner).where(Partner.account_user_id == user.id)
        ).first()
        if not partner:
            raise HTTPException(status_code=403, detail="Partner account is not configured")
        return partner, None
    membership = session.exec(
        select(PartnerMember).where(
            PartnerMember.user_id == user.id,
            PartnerMember.member_type == "doctor",
            PartnerMember.status == "active",
        )
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Partner or instructor account required")
    partner = session.get(Partner, membership.partner_id)
    if not partner:
        raise HTTPException(status_code=403, detail="Partner account is not configured")
    return partner, membership


def _assert_partner_active(partner: Partner):
    now = datetime.utcnow()
    if partner.status != "active":
        raise HTTPException(status_code=403, detail="Partner account is inactive")
    if partner.subscription_status != "active":
        raise HTTPException(status_code=403, detail="Partner subscription is inactive")
    if partner.subscription_start and partner.subscription_start > now:
        raise HTTPException(status_code=403, detail="Partner subscription has not started")
    if partner.subscription_expires and partner.subscription_expires <= now:
        raise HTTPException(status_code=403, detail="Partner subscription has expired")


def _member_count(session: Session, partner_id: str, member_type: str = "student") -> int:
    return len(session.exec(
        select(PartnerMember).where(
            PartnerMember.partner_id == partner_id,
            PartnerMember.member_type == member_type,
            PartnerMember.status == "active",
        )
    ).all())


def _assert_capacity(session: Session, partner: Partner, additional: int = 1):
    if partner.max_students is not None and _member_count(session, partner.id) + additional > partner.max_students:
        raise HTTPException(status_code=409, detail="The partner student limit has been reached")


def _member_for_user(
    session: Session,
    partner_id: str,
    user_id: str,
    *,
    include_inactive: bool = False,
):
    member = session.exec(
        select(PartnerMember).where(
            PartnerMember.partner_id == partner_id,
            PartnerMember.user_id == user_id,
            PartnerMember.member_type == "student",
        )
    ).first()
    if not member or (member.status != "active" and not include_inactive):
        raise HTTPException(status_code=404, detail="Student not found")
    return member


def _can_manage_student(user: User, membership: PartnerMember | None, student: PartnerMember):
    if user.role == "partner":
        return
    if (
        user.role == "doctor"
        and membership
        and membership.member_type == "doctor"
        and student.member_type == "student"
        and student.doctor_id == user.id
    ):
        return
    raise HTTPException(status_code=404, detail="Student not found")


def _assigned_learning(partner: Partner):
    if partner.learning_mode != "student_discovery":
        config = _doctor_track_config(partner)
        track = _clean(config.get("track"))
        topics = [_clean(item) for item in config.get("topics", []) if isinstance(item, str) and _clean(item)]
        if topics:
            track = f"{track} — focus: {', '.join(topics[:12])}"
        return track, [
            _clean(item) for item in config.get("skills", [])
            if isinstance(item, str) and _clean(item)
        ]
    return None, []


def _update_unstarted_student_profiles(session: Session, partner: Partner):
    goal, skills = _assigned_learning(partner)
    members = session.exec(
        select(PartnerMember).where(
            PartnerMember.partner_id == partner.id,
            PartnerMember.member_type == "student",
            PartnerMember.status == "active",
        )
    ).all()
    for member in members:
        if session.exec(select(Roadmap.id).where(Roadmap.user_id == member.user_id)).first():
            continue
        profile = session.exec(
            select(LearningProfile).where(LearningProfile.user_id == member.user_id)
            .order_by(LearningProfile.updated_date.desc())
        ).first()
        if profile:
            profile.goal = goal
            profile.target_skills = skills
            profile.onboarding_step = (
                "partner_intake" if partner.learning_mode != "student_discovery"
                else "roadmap" if goal
                else "discovery"
            )
            profile.updated_date = datetime.utcnow()
            session.add(profile)


def _create_member(session: Session, partner: Partner, data: dict, member_type: str, doctor_id: str | None = None):
    member_type = member_type.strip().lower()
    if member_type not in {"doctor", "student"}:
        raise HTTPException(status_code=422, detail="Member type must be doctor or student")
    full_name = _clean(data.get("full_name"))
    email = _clean(data.get("email")).lower()
    username = _clean(data.get("username"))
    password = data.get("password") or ""
    if not full_name or len(full_name) > 160:
        raise HTTPException(status_code=422, detail="Full name is required and must be at most 160 characters")
    if not email:
        raise HTTPException(status_code=422, detail="An email address is required")
    if email and (not EMAIL_RE.fullmatch(email) or len(email) > 254):
        raise HTTPException(status_code=422, detail="Invalid email address")
    if username and (len(username) > 64 or not re.fullmatch(r"[\w.@+-]+", username, re.UNICODE)):
        raise HTTPException(status_code=422, detail="Username contains unsupported characters")
    if not isinstance(password, str) or not 8 <= len(password) <= 72:
        raise HTTPException(status_code=422, detail="Password must be 8 to 72 characters")
    if email and session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if username and session.exec(
        select(PartnerMember).where(func.lower(PartnerMember.username) == username.lower())
    ).first():
        raise HTTPException(status_code=409, detail="Username already registered")
    role = "doctor" if member_type == "doctor" else "partner_student"
    account = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        phone_number=_clean(data.get("phone")) or None,
        role=role,
        status="active",
        subscription_status="none",
    )
    session.add(account)
    session.flush()
    membership = PartnerMember(
        partner_id=partner.id,
        user_id=account.id,
        member_type=member_type,
        doctor_id=doctor_id if member_type == "student" else None,
        username=username or None,
        national_id=_clean(data.get("national_id")) or None,
    )
    session.add(membership)
    if member_type == "student":
        goal, skills = _assigned_learning(partner)
        profile = LearningProfile(
            user_id=account.id,
            full_name=full_name,
            goal=goal,
            current_level="beginner",
            known_skills=[],
            target_skills=skills,
            onboarding_step=(
                "partner_intake" if partner.learning_mode != "student_discovery"
                else "roadmap" if goal
                else "discovery"
            ),
        )
        session.add(profile)
    session.flush()
    return account, membership


def _score_history(progress_rows, lesson_by_id):
    attempts = []
    for row in progress_rows:
        history = row.quiz_answers.get("history", []) if isinstance(row.quiz_answers, dict) else []
        if not history and row.attempts > 0 and row.quiz_score is not None:
            history = [{
                "score": row.quiz_score,
                "passed": row.quiz_score >= (lesson_by_id[row.lesson_id].quiz_passing_score if row.lesson_id in lesson_by_id else 80),
                "submitted_at": row.updated_date.isoformat() if row.updated_date else None,
            }]
        if not isinstance(history, list):
            continue
        lesson = lesson_by_id.get(row.lesson_id)
        for item in history:
            if not isinstance(item, dict):
                continue
            try:
                score = max(0, min(100, float(item.get("score") or 0)))
            except (TypeError, ValueError):
                score = 0
            feedback_items = []
            raw_feedback = item.get("feedback", [])
            saved_answers = item.get("answers", {}) if isinstance(item.get("answers"), dict) else {}
            for answer in raw_feedback if isinstance(raw_feedback, list) else []:
                if not isinstance(answer, dict):
                    continue
                try:
                    question_index = int(answer.get("index"))
                except (TypeError, ValueError):
                    question_index = -1
                student_answer = saved_answers.get(str(question_index), saved_answers.get(question_index))
                question = (
                    lesson.quiz[question_index]
                    if lesson and isinstance(lesson.quiz, list) and 0 <= question_index < len(lesson.quiz)
                    else {}
                )
                if isinstance(question.get("options"), list):
                    try:
                        selected_index = int(student_answer)
                    except (TypeError, ValueError):
                        selected_index = -1
                    options = question["options"]
                    student_answer = options[selected_index] if 0 <= selected_index < len(options) else None
                feedback_items.append({
                    "topic": _clean(answer.get("topic") or (lesson.node_title if lesson else "Lesson")),
                    "question": str(answer.get("question") or "")[:500],
                    "correct": bool(answer.get("correct")),
                    "student_answer": str(student_answer)[:500] if student_answer is not None else None,
                    "correct_answer": str(answer.get("correct_answer") or answer.get("expected_answer") or "")[:500],
                    "feedback": str(answer.get("feedback") or answer.get("explanation") or "")[:700],
                })
            attempts.append({
                "lesson_id": row.lesson_id,
                "lesson_title": lesson.node_title if lesson else "Lesson",
                "score": round(score),
                "passed": bool(item.get("passed", score >= (lesson.quiz_passing_score if lesson else 80))),
                "submitted_at": item.get("submitted_at"),
                "feedback": feedback_items,
            })
    return sorted(attempts, key=lambda item: item.get("submitted_at") or "")[-100:]


def _student_snapshot(session: Session, user: User, membership: PartnerMember):
    roadmaps = session.exec(
        select(Roadmap).where(Roadmap.user_id == user.id).order_by(Roadmap.created_date.desc())
    ).all()
    lessons = session.exec(
        select(Lesson).where(Lesson.user_id == user.id).order_by(Lesson.order)
    ).all()
    progress = session.exec(select(LessonProgress).where(LessonProgress.user_id == user.id)).all()
    profile = session.exec(
        select(LearningProfile).where(LearningProfile.user_id == user.id)
        .order_by(LearningProfile.updated_date.desc())
    ).first()
    projects = session.exec(select(Project).where(Project.user_id == user.id)).all()
    cv = session.exec(select(CV).where(CV.user_id == user.id).order_by(CV.updated_date.desc())).first()
    lesson_by_id = {lesson.id: lesson for lesson in lessons}
    attempts = _score_history(progress, lesson_by_id)
    topic_scores = {}
    for attempt in attempts:
        for answer in attempt["feedback"]:
            topic = answer["topic"] or attempt["lesson_title"] or "Lesson"
            score = topic_scores.setdefault(topic, {
                "topic": topic, "correct": 0, "incorrect": 0, "questions": 0,
            })
            score["questions"] += 1
            score["correct" if answer["correct"] else "incorrect"] += 1
    quiz_topics = sorted(
        (
            {**item, "accuracy": round(item["correct"] / item["questions"] * 100)}
            for item in topic_scores.values()
        ),
        key=lambda item: (-item["questions"], item["topic"].casefold()),
    )
    completed = sum(lesson.status == "completed" or lesson.quiz_passed for lesson in lessons)
    capstones = [
        lesson for lesson in lessons
        if lesson.node_id == "stage_project_final" or (lesson.task or {}).get("is_capstone_project")
    ]
    completed_capstone = any(lesson.status == "completed" or lesson.quiz_passed for lesson in capstones)
    progress_by_lesson = {item.lesson_id: item for item in progress}
    lesson_details = [
        {
            "id": lesson.id,
            "roadmap_id": lesson.roadmap_id,
            "title": lesson.node_title or lesson.node_id,
            "phase": lesson.phase,
            "status": lesson.status,
            "quiz_score": lesson.quiz_score if lesson.quiz_score is not None else (
                progress_by_lesson[lesson.id].quiz_score
                if lesson.id in progress_by_lesson and progress_by_lesson[lesson.id].attempts > 0
                else None
            ),
            "quiz_passed": lesson.quiz_passed,
            "video_title": lesson.video_title,
            "video_duration": lesson.video_duration,
            "video_watched": progress_by_lesson[lesson.id].video_watched if lesson.id in progress_by_lesson else False,
            "video_position_sec": progress_by_lesson[lesson.id].video_position_sec if lesson.id in progress_by_lesson else 0,
            "attempts": progress_by_lesson[lesson.id].attempts if lesson.id in progress_by_lesson else 0,
        }
        for lesson in lessons
    ]
    assessments = session.exec(
        select(PartnerAssessment).where(PartnerAssessment.partner_id == membership.partner_id)
    ).all()
    assessments = [
        item for item in assessments
        if item.doctor_id is None or item.doctor_id == membership.doctor_id
    ]
    attempts_by_assessment = {}
    assessment_ids = [item.id for item in assessments]
    if assessment_ids:
        for attempt in session.exec(
            select(PartnerAssessmentAttempt).where(
                PartnerAssessmentAttempt.user_id == user.id,
                PartnerAssessmentAttempt.assessment_id.in_(assessment_ids),
            ).order_by(PartnerAssessmentAttempt.submitted_date.desc())
        ).all():
            attempts_by_assessment.setdefault(attempt.assessment_id, []).append(attempt)
    exam_results = []
    for assessment in assessments:
        attempt_list = attempts_by_assessment.get(assessment.id, [])
        if attempt_list:
            exam_results.append({
                "assessment_id": assessment.id,
                "title": assessment.title,
                "kind": assessment.kind,
                "attempts": [{
                    "id": item.id,
                    "score": item.score,
                    "total_points": item.total_points,
                    "percentage": round(item.score / item.total_points * 100) if item.total_points else 0,
                    "submitted_date": item.submitted_date.isoformat(),
                } for item in attempt_list],
            })
    exam_scores = [
        attempt["percentage"]
        for exam in exam_results
        for attempt in exam["attempts"]
    ]
    has_activity = bool(
        completed
        or attempts
        or exam_scores
        or any(
            (row.attempts or 0) > 0
            or row.status in {"in_progress", "completed"}
            or row.video_watched
            or row.video_position_sec > 0
            or row.video_watched_sec > 0
            for row in progress
        )
    )
    performance_components = [
        (round(completed / len(lessons) * 100), 0.4)
    ] if lessons else []
    if attempts:
        performance_components.append((
            round(sum(item["score"] for item in attempts) / len(attempts)),
            0.4,
        ))
    if exam_scores:
        performance_components.append((
            round(sum(exam_scores) / len(exam_scores)),
            0.2,
        ))
    performance_score = round(
        sum(score * weight for score, weight in performance_components)
        / sum(weight for _, weight in performance_components)
    ) if performance_components else 0
    learning_complete = bool(
        lessons
        and completed == len(lessons)
        and (not capstones or completed_capstone)
    )
    learning_status = "completed" if learning_complete else "learning" if has_activity else "not_started"
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email if not user.email.endswith("@partner.zeus") else None,
        "username": membership.username,
        "phone": user.phone_e164 or user.phone_number,
        "status": user.status,
        "member_status": membership.status,
        "doctor_id": membership.doctor_id,
        "created_date": user.created_date.isoformat() if user.created_date else None,
        "track": roadmaps[0].goal if roadmaps else profile.goal if profile else None,
        "roadmap_status": roadmaps[0].status if roadmaps else "not_started",
        "roadmaps": [
            {
                "id": item.id,
                "goal": item.goal,
                "status": item.status,
                "version": item.version,
                "created_date": item.created_date.isoformat() if item.created_date else None,
            }
            for item in roadmaps
        ],
        "lessons_total": len(lessons),
        "lessons_completed": completed,
        "learning_status": learning_status,
        "lessons": lesson_details,
        "progress_percent": round(completed / len(lessons) * 100) if lessons else 0,
        "capstone_exists": bool(capstones),
        "capstone_completed": completed_capstone,
        "quiz_attempts": attempts,
        "average_quiz_score": round(sum(item["score"] for item in attempts) / len(attempts)) if attempts else 0,
        "average_exam_score": round(sum(exam_scores) / len(exam_scores)) if exam_scores else 0,
        "performance_score": performance_score,
        "has_learning_activity": has_activity,
        "performance_band": (
            None if not has_activity
            else "high" if performance_score >= 80
            else "average" if performance_score >= 60
            else "needs_support"
        ),
        "quiz_topics": quiz_topics,
        "strength_topics": [
            item for item in quiz_topics
            if item["questions"] >= 1 and item["accuracy"] >= 80
        ],
        "weak_topics": [
            item for item in quiz_topics
            if item["incorrect"] > 0 and item["accuracy"] < 80
        ],
        "exam_results": exam_results,
        "exam_attempt_count": sum(len(items) for items in attempts_by_assessment.values()),
        "profile": {
            "goal": profile.goal,
            "current_role": profile.current_role,
            "current_level": profile.current_level,
            "career_intent": profile.career_intent,
            "learning_style": profile.learning_style,
            "preferred_language": profile.preferred_language,
            "weekly_hours": profile.weekly_hours,
            "available_days": profile.available_days,
            "preferred_time": profile.preferred_time,
            "motivation": profile.motivation,
            "education": profile.education,
            "experience": profile.experience,
            "background": profile.background,
            "declared_strengths": profile.strengths,
            "declared_weaknesses": profile.weaknesses,
            "known_skills": profile.known_skills,
        } if profile else None,
        "skills": profile.skill_graph if profile and isinstance(profile.skill_graph, list) else [],
        "target_skills": profile.target_skills if profile and isinstance(profile.target_skills, list) else [],
        "projects": [item.model_dump() for item in projects],
        "cv_url": f"/portfolio/{user.id}" if cv else None,
        "cv_updated_date": cv.updated_date.isoformat() if cv and cv.updated_date else None,
        "national_id": membership.national_id,
    }


def _filter_student_snapshots(
    students: list[dict],
    *,
    search: str = "",
    status: str = "all",
    performance: str = "all",
    sort: str = "performance_desc",
):
    allowed_statuses = {"all", "completed", "learning", "not_started", "inactive", "needs_review"}
    allowed_performance = {"all", "high", "average", "needs_support"}
    allowed_sorts = {"performance_desc", "progress_desc", "quiz_desc", "exam_desc", "progress_asc", "name_asc"}
    if status not in allowed_statuses or performance not in allowed_performance or sort not in allowed_sorts:
        raise HTTPException(status_code=422, detail="Invalid student filter")
    needle = _clean(search).casefold()
    filtered = []
    for student in students:
        complete = (
            student["lessons_total"] > 0
            and student["lessons_completed"] == student["lessons_total"]
            and (not student["capstone_exists"] or student["capstone_completed"])
        )
        matches_status = (
            status == "all"
            or status == "completed" and complete
            or status == "learning" and student["learning_status"] == "learning"
            or status == "not_started" and student["learning_status"] == "not_started"
            or status == "inactive" and student["member_status"] != "active"
            or status == "needs_review" and bool(student["quiz_attempts"]) and student["average_quiz_score"] < 70
        )
        matches_performance = (
            performance == "all" or student.get("performance_band") == performance
        )
        searchable = " ".join(
            str(student.get(key) or "")
            for key in ("full_name", "email", "username", "phone", "track")
        ).casefold()
        if matches_status and matches_performance and (not needle or needle in searchable):
            filtered.append(student)
    sort_keys = {
        "performance_desc": lambda item: (-item["performance_score"], item["full_name"] or ""),
        "progress_desc": lambda item: (-item["progress_percent"], item["full_name"] or ""),
        "quiz_desc": lambda item: (-item["average_quiz_score"], item["full_name"] or ""),
        "exam_desc": lambda item: (-item["average_exam_score"], item["full_name"] or ""),
        "progress_asc": lambda item: (item["progress_percent"], item["full_name"] or ""),
        "name_asc": lambda item: ((item["full_name"] or "").casefold(),),
    }
    return sorted(filtered, key=sort_keys[sort])


def _safe_excel_value(value):
    if isinstance(value, str) and value.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")):
        return f"'{value}"
    return value


def _student_export(students: list[dict], partner_name: str):
    workbook = Workbook()
    summary = workbook.active
    summary.title = "Students"
    summary.append([
        "Name", "Email", "Username", "Phone", "Track", "Account status",
        "Progress %", "Lessons completed", "Lessons total", "Quiz average %",
        "Exam average %", "Performance score", "Performance band",
        "Capstone status", "Joined", "Learning status",
    ])
    quizzes = workbook.create_sheet("Quiz grades")
    quizzes.append(["Student", "Email", "Lesson / quiz", "Score %", "Passed", "Submitted"])
    exams = workbook.create_sheet("Exam grades")
    exams.append(["Student", "Email", "Exam", "Kind", "Score", "Total points", "Score %", "Submitted"])
    for student in students:
        summary.append([
            _safe_excel_value(student["full_name"]),
            _safe_excel_value(student["email"]),
            _safe_excel_value(student["username"]),
            _safe_excel_value(student["phone"]),
            _safe_excel_value(student["track"]),
            student["member_status"],
            student["progress_percent"],
            student["lessons_completed"],
            student["lessons_total"],
            student["average_quiz_score"],
            student["average_exam_score"],
            student["performance_score"],
            student["performance_band"],
            "Complete" if student["capstone_completed"] else "Pending" if student["capstone_exists"] else "Not assigned",
            student["created_date"],
            student["learning_status"],
        ])
        for attempt in student["quiz_attempts"]:
            quizzes.append([
                _safe_excel_value(student["full_name"]),
                _safe_excel_value(student["email"]),
                _safe_excel_value(attempt["lesson_title"]),
                attempt["score"],
                "Yes" if attempt["passed"] else "No",
                attempt["submitted_at"],
            ])
        for exam in student["exam_results"]:
            for attempt in exam["attempts"]:
                exams.append([
                    _safe_excel_value(student["full_name"]),
                    _safe_excel_value(student["email"]),
                    _safe_excel_value(exam["title"]),
                    exam["kind"],
                    attempt["score"],
                    attempt["total_points"],
                    attempt["percentage"],
                    attempt["submitted_date"],
                ])
    for sheet in workbook.worksheets:
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        for cell in sheet[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="24314A")
        for column in sheet.columns:
            width = min(36, max(12, max(len(str(cell.value or "")) for cell in column) + 2))
            sheet.column_dimensions[column[0].column_letter].width = width
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "-", partner_name).strip("-") or "partner"
    filename = f"zeus-{safe_name}-students-{datetime.utcnow():%Y%m%d-%H%M%S}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _dashboard(
    session: Session,
    partner: Partner,
    instructor: PartnerMember | None,
    *,
    include_inactive: bool = False,
):
    query = select(PartnerMember).where(
        PartnerMember.partner_id == partner.id,
        PartnerMember.member_type == "student",
    )
    if not include_inactive:
        query = query.where(PartnerMember.status == "active")
    if instructor:
        query = query.where(PartnerMember.doctor_id == instructor.user_id)
    members = session.exec(query.order_by(PartnerMember.created_date.desc()).limit(1000)).all()
    user_ids = [member.user_id for member in members]
    users = {
        user.id: user for user in session.exec(select(User).where(User.id.in_(user_ids))).all()
    } if user_ids else {}
    snapshots = [
        _student_snapshot(session, users[member.user_id], member)
        for member in members if member.user_id in users
    ]
    active_snapshots = [item for item in snapshots if item["member_status"] == "active"]
    completed_students = [
        item for item in snapshots
        if item["member_status"] == "active" and item["learning_status"] == "completed"
    ]
    active = [item for item in active_snapshots if item["learning_status"] == "learning"]
    all_scores = [attempt["score"] for item in active_snapshots for attempt in item["quiz_attempts"]]
    stats = {
        "students": len(active_snapshots),
        "completed": len(completed_students),
        "learning": len(active),
        "not_started": sum(item["learning_status"] == "not_started" for item in active_snapshots),
        "capstones_completed": sum(item["capstone_completed"] for item in active_snapshots),
        "needs_review": sum(
            item["average_quiz_score"] < 70
            for item in active_snapshots
            if item["quiz_attempts"]
        ),
        "average_progress": round(sum(item["progress_percent"] for item in active_snapshots) / len(active_snapshots)) if active_snapshots else 0,
        "average_quiz_score": round(sum(all_scores) / len(all_scores)) if all_scores else 0,
        "exam_attempts": sum(item["exam_attempt_count"] for item in active_snapshots),
        "average_exam_score": round(
            sum(
                attempt["percentage"]
                for student in active_snapshots
                for exam in student["exam_results"]
                for attempt in exam["attempts"]
            )
            / max(1, sum(item["exam_attempt_count"] for item in active_snapshots))
        ),
        "final_exams_completed": sum(
            any(exam["kind"] == "final_exam" and exam["attempts"] for exam in item["exam_results"])
            for item in active_snapshots
        ),
    }
    top_students = sorted(
        (item for item in active_snapshots if item["has_learning_activity"]),
        key=lambda item: (-item["progress_percent"], -item["average_quiz_score"], item["full_name"] or ""),
    )[:5]
    return {
        "stats": stats,
        "students": snapshots,
        "top_students": [
            {"id": item["id"], "full_name": item["full_name"], "progress_percent": item["progress_percent"], "average_quiz_score": item["average_quiz_score"]}
            for item in top_students
        ],
    }


def _community_membership_ids(
    session: Session,
    partner: Partner,
    instructor: PartnerMember | None,
    member_ids,
):
    if not isinstance(member_ids, list) or len(member_ids) > 1000:
        raise HTTPException(status_code=422, detail="Community members must be a list of student IDs")
    requested = list(dict.fromkeys(str(item) for item in member_ids))
    query = select(PartnerMember).where(
        PartnerMember.partner_id == partner.id,
        PartnerMember.member_type == "student",
        PartnerMember.status == "active",
    )
    if instructor:
        query = query.where(PartnerMember.doctor_id == instructor.user_id)
    eligible = {item.user_id for item in session.exec(query).all()}
    if not set(requested).issubset(eligible):
        raise HTTPException(status_code=422, detail="Community members must be active students in your scope")
    return requested


def _community_data(community: Community, session: Session):
    member_ids = community.members or []
    accounts = {
        account.id: account for account in session.exec(
            select(User).where(User.id.in_(member_ids))
        ).all()
    } if member_ids else {}
    return {
        "id": community.id,
        "name": community.name,
        "description": community.description,
        "goal": community.goal,
        "stage": community.stage,
        "members": member_ids,
        "member_count": community.member_count,
        "is_closed": community.is_closed,
        "created_date": community.created_date.isoformat() if community.created_date else None,
        "member_names": [accounts[user_id].full_name for user_id in member_ids if user_id in accounts],
    }


def _list_partner_communities(session: Session, partner: Partner, instructor: PartnerMember | None):
    communities = session.exec(
        select(Community).where(Community.partner_id == partner.id)
        .order_by(Community.created_date.desc())
    ).all()
    if instructor:
        assigned = {
            member.user_id for member in session.exec(
                select(PartnerMember).where(
                    PartnerMember.partner_id == partner.id,
                    PartnerMember.member_type == "student",
                    PartnerMember.doctor_id == instructor.user_id,
                    PartnerMember.status == "active",
                )
            ).all()
        }
        communities = [
            item for item in communities
            if item.doctor_id == instructor.user_id
            or any(user_id in assigned for user_id in (item.members or []))
        ]
    return [_community_data(item, session) for item in communities]


def _create_partner_community(session: Session, partner: Partner, instructor, user: User, data: dict):
    name = _clean(data.get("name"))
    description = _clean(data.get("description"))
    goal = _clean(data.get("goal"))
    stage = _clean(data.get("stage"))
    if not name or len(name) > 160:
        raise HTTPException(status_code=422, detail="Community name is required and must be at most 160 characters")
    if len(description) > 2000 or len(goal) > 200 or len(stage) > 120:
        raise HTTPException(status_code=422, detail="Community description, goal, or stage is too long")
    member_ids = _community_membership_ids(
        session, partner, instructor, data.get("members", [])
    )
    community = Community(
        name=name,
        description=description or None,
        goal=goal or None,
        stage=stage or None,
        members=member_ids,
        member_count=len(member_ids),
        is_closed=False,
        partner_id=partner.id,
        doctor_id=instructor.user_id if instructor else None,
    )
    session.add(community)
    session.commit()
    session.refresh(community)
    return _community_data(community, session)


def _update_partner_community(session: Session, partner: Partner, instructor, community_id: str, data: dict):
    community = session.exec(
        select(Community).where(
            Community.id == community_id,
            Community.partner_id == partner.id,
        )
    ).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    if instructor and community.doctor_id != instructor.user_id and not any(
        member.doctor_id == instructor.user_id and member.user_id in (community.members or [])
        for member in session.exec(
            select(PartnerMember).where(
                PartnerMember.partner_id == partner.id,
                PartnerMember.member_type == "student",
                PartnerMember.status == "active",
            )
        ).all()
    ):
        raise HTTPException(status_code=404, detail="Community not found")
    for field, maximum in (("name", 160), ("description", 2000), ("goal", 200), ("stage", 120)):
        if field in data:
            value = _clean(data[field])
            if field == "name" and not value:
                raise HTTPException(status_code=422, detail="Community name is required")
            if len(value) > maximum:
                raise HTTPException(status_code=422, detail=f"Community {field} is too long")
            setattr(community, field, value or None if field != "name" else value)
    if "members" in data:
        community.members = _community_membership_ids(session, partner, instructor, data["members"])
        community.member_count = len(community.members)
    if "is_closed" in data:
        if not isinstance(data["is_closed"], bool):
            raise HTTPException(status_code=422, detail="Community closed state must be boolean")
        community.is_closed = data["is_closed"]
    community.updated_date = datetime.utcnow()
    session.add(community)
    session.commit()
    session.refresh(community)
    return _community_data(community, session)


def _validate_assessment_questions(raw_questions):
    if not isinstance(raw_questions, list) or not 1 <= len(raw_questions) <= 100:
        raise HTTPException(status_code=422, detail="An assessment must have between 1 and 100 questions")
    questions = []
    for index, raw in enumerate(raw_questions):
        if not isinstance(raw, dict):
            raise HTTPException(status_code=422, detail=f"Question {index + 1} is invalid")
        prompt = _clean(raw.get("prompt"))
        options = raw.get("options")
        correct_index = raw.get("correct_index")
        points = raw.get("points", 1)
        if not prompt or len(prompt) > 2000:
            raise HTTPException(status_code=422, detail=f"Question {index + 1} needs a prompt")
        if not isinstance(options, list) or not 2 <= len(options) <= 8 or any(
            not isinstance(option, str) or not option.strip() or len(option) > 500
            for option in options
        ):
            raise HTTPException(status_code=422, detail=f"Question {index + 1} needs 2 to 8 answer choices")
        if isinstance(correct_index, bool) or not isinstance(correct_index, int) or not 0 <= correct_index < len(options):
            raise HTTPException(status_code=422, detail=f"Question {index + 1} has an invalid correct answer")
        try:
            points = float(points)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=f"Question {index + 1} points must be numeric") from exc
        if not 0 < points <= 1000:
            raise HTTPException(status_code=422, detail=f"Question {index + 1} points must be between 0 and 1000")
        questions.append({
            "prompt": prompt,
            "options": [option.strip() for option in options],
            "correct_index": correct_index,
            "points": points,
        })
    return questions


def _assessment_data(assessment: PartnerAssessment, *, include_answers: bool, attempt=None):
    questions = []
    for question in assessment.questions or []:
        item = {
            "prompt": question["prompt"],
            "options": question["options"],
            "points": question["points"],
        }
        if include_answers:
            item["correct_index"] = question["correct_index"]
        questions.append(item)
    result = {
        "id": assessment.id,
        "title": assessment.title,
        "description": assessment.description,
        "kind": assessment.kind,
        "questions": questions,
        "question_count": len(questions),
        "is_active": assessment.is_active,
        "created_date": assessment.created_date.isoformat() if assessment.created_date else None,
    }
    if attempt:
        result["latest_attempt"] = {
            "score": attempt.score,
            "total_points": attempt.total_points,
            "percentage": round(attempt.score / attempt.total_points * 100) if attempt.total_points else 0,
            "submitted_date": attempt.submitted_date.isoformat(),
        }
    return result


def _require_community_feature(user: User, session: Session):
    if not partner_feature_enabled(user, session, "community"):
        raise HTTPException(status_code=403, detail="Communities are disabled by the educational partner")


def _require_learning_feature(user: User, session: Session):
    if not partner_feature_enabled(user, session, "learning"):
        raise HTTPException(status_code=403, detail="Learning access is disabled by the educational partner")


@router.get("/admin/{partner_id}/communities")
def admin_list_partner_communities(
    partner_id: str,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    return {"communities": _list_partner_communities(session, partner, None)}


@router.post("/admin/{partner_id}/communities", status_code=201)
def admin_create_partner_community(
    partner_id: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    return {"community": _create_partner_community(session, partner, None, admin, data)}


@router.put("/admin/{partner_id}/communities/{community_id}")
def admin_update_partner_community(
    partner_id: str,
    community_id: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    return {"community": _update_partner_community(session, partner, None, community_id, data)}


@router.get("/communities")
def partner_list_communities(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    _require_community_feature(user, session)
    return {"communities": _list_partner_communities(session, partner, instructor)}


@router.post("/communities", status_code=201)
def partner_create_community(
    data: dict = Body(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    _require_community_feature(user, session)
    return {"community": _create_partner_community(session, partner, instructor, user, data)}


@router.put("/communities/{community_id}")
def partner_update_community(
    community_id: str,
    data: dict = Body(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    _require_community_feature(user, session)
    return {"community": _update_partner_community(session, partner, instructor, community_id, data)}


@router.get("/assessments")
def list_partner_assessments(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if user.role == "partner_student":
        membership = session.exec(
            select(PartnerMember).where(
                PartnerMember.user_id == user.id,
                PartnerMember.member_type == "student",
                PartnerMember.status == "active",
            )
        ).first()
        partner = session.get(Partner, membership.partner_id) if membership else None
        if not membership or not partner:
            raise HTTPException(status_code=403, detail="Partner student membership is not active")
        _assert_partner_active(partner)
        _require_learning_feature(user, session)
        assessments = session.exec(
            select(PartnerAssessment).where(
                PartnerAssessment.partner_id == partner.id,
                PartnerAssessment.is_active == True,  # noqa: E712
            ).order_by(PartnerAssessment.created_date.desc())
        ).all()
        attempts = session.exec(
            select(PartnerAssessmentAttempt).where(
                PartnerAssessmentAttempt.user_id == user.id,
            ).order_by(PartnerAssessmentAttempt.submitted_date.desc())
        ).all()
        latest = {}
        for attempt in attempts:
            latest.setdefault(attempt.assessment_id, attempt)
        return {
            "assessments": [
                _assessment_data(item, include_answers=False, attempt=latest.get(item.id))
                for item in assessments
                if item.doctor_id is None or item.doctor_id == membership.doctor_id
            ]
        }
    if user.role not in {"partner", "doctor"}:
        raise HTTPException(status_code=403, detail="Partner account required")
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    _require_learning_feature(user, session)
    query = select(PartnerAssessment).where(PartnerAssessment.partner_id == partner.id)
    if instructor:
        query = query.where(
            (PartnerAssessment.doctor_id == instructor.user_id)
            | (PartnerAssessment.doctor_id == None)  # noqa: E711
        )
    assessments = session.exec(query.order_by(PartnerAssessment.created_date.desc())).all()
    return {"assessments": [_assessment_data(item, include_answers=True) for item in assessments]}


@router.post("/assessments", status_code=201)
def create_partner_assessment(
    data: dict = Body(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if user.role not in {"partner", "doctor"}:
        raise HTTPException(status_code=403, detail="Partner or instructor account required")
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    _require_learning_feature(user, session)
    title = _clean(data.get("title"))
    description = _clean(data.get("description"))
    kind = _clean(data.get("kind")) or "exam"
    if not title or len(title) > 160:
        raise HTTPException(status_code=422, detail="Assessment title is required")
    if len(description) > 2000 or kind not in {"exam", "final_exam"}:
        raise HTTPException(status_code=422, detail="Invalid assessment description or type")
    doctor_id = instructor.user_id if instructor else (_clean(data.get("doctor_id")) or None)
    if doctor_id:
        doctor = session.exec(
            select(PartnerMember).where(
                PartnerMember.partner_id == partner.id,
                PartnerMember.user_id == doctor_id,
                PartnerMember.member_type == "doctor",
                PartnerMember.status == "active",
            )
        ).first()
        if not doctor:
            raise HTTPException(status_code=404, detail="Instructor not found")
    assessment = PartnerAssessment(
        partner_id=partner.id,
        doctor_id=doctor_id,
        created_by=user.id,
        title=title,
        description=description or None,
        kind=kind,
        questions=_validate_assessment_questions(data.get("questions")),
    )
    session.add(assessment)
    session.commit()
    session.refresh(assessment)
    return {"assessment": _assessment_data(assessment, include_answers=True)}


@router.put("/assessments/{assessment_id}")
def update_partner_assessment(
    assessment_id: str,
    data: dict = Body(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if user.role not in {"partner", "doctor"}:
        raise HTTPException(status_code=403, detail="Partner or instructor account required")
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    _require_learning_feature(user, session)
    assessment = session.exec(
        select(PartnerAssessment).where(
            PartnerAssessment.id == assessment_id,
            PartnerAssessment.partner_id == partner.id,
        )
    ).first()
    if not assessment or (instructor and assessment.created_by != user.id):
        raise HTTPException(status_code=404, detail="Assessment not found")
    if "title" in data:
        title = _clean(data["title"])
        if not title or len(title) > 160:
            raise HTTPException(status_code=422, detail="Assessment title is required")
        assessment.title = title
    if "description" in data:
        description = _clean(data["description"])
        if len(description) > 2000:
            raise HTTPException(status_code=422, detail="Assessment description is too long")
        assessment.description = description or None
    if "kind" in data:
        if data["kind"] not in {"exam", "final_exam"}:
            raise HTTPException(status_code=422, detail="Invalid assessment type")
        assessment.kind = data["kind"]
    if "questions" in data:
        assessment.questions = _validate_assessment_questions(data["questions"])
    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            raise HTTPException(status_code=422, detail="Assessment active state must be boolean")
        assessment.is_active = data["is_active"]
    assessment.updated_date = datetime.utcnow()
    session.add(assessment)
    session.commit()
    session.refresh(assessment)
    return {"assessment": _assessment_data(assessment, include_answers=True)}


@router.post("/assessments/{assessment_id}/attempts", status_code=201)
def submit_partner_assessment(
    assessment_id: str,
    data: dict = Body(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if user.role != "partner_student":
        raise HTTPException(status_code=403, detail="Only enrolled students can submit an assessment")
    membership = session.exec(
        select(PartnerMember).where(
            PartnerMember.user_id == user.id,
            PartnerMember.member_type == "student",
            PartnerMember.status == "active",
        )
    ).first()
    partner = session.get(Partner, membership.partner_id) if membership else None
    if not membership or not partner:
        raise HTTPException(status_code=403, detail="Partner student membership is not active")
    _assert_partner_active(partner)
    _require_learning_feature(user, session)
    assessment = session.exec(
        select(PartnerAssessment).where(
            PartnerAssessment.id == assessment_id,
            PartnerAssessment.partner_id == partner.id,
            PartnerAssessment.is_active == True,  # noqa: E712
        )
    ).first()
    if not assessment or (assessment.doctor_id and assessment.doctor_id != membership.doctor_id):
        raise HTTPException(status_code=404, detail="Assessment not found")
    answers = data.get("answers")
    if not isinstance(answers, (dict, list)):
        raise HTTPException(status_code=422, detail="Answers must be an object or list of answer indexes")
    score = 0.0
    total_points = 0.0
    clean_answers = {}
    for index, question in enumerate(assessment.questions or []):
        points = float(question.get("points", 1))
        total_points += points
        raw_answer = answers.get(str(index), answers.get(index)) if isinstance(answers, dict) else (
            answers[index] if index < len(answers) else None
        )
        try:
            answer_index = int(raw_answer)
        except (TypeError, ValueError):
            continue
        if not 0 <= answer_index < len(question["options"]):
            raise HTTPException(status_code=422, detail=f"Answer {index + 1} is not a valid choice")
        clean_answers[str(index)] = answer_index
        if answer_index == question["correct_index"]:
            score += points
    attempt = PartnerAssessmentAttempt(
        assessment_id=assessment.id,
        partner_id=partner.id,
        user_id=user.id,
        answers=clean_answers,
        score=score,
        total_points=total_points,
    )
    session.add(attempt)
    session.commit()
    session.refresh(attempt)
    return {
        "attempt": {
            "id": attempt.id,
            "score": attempt.score,
            "total_points": attempt.total_points,
            "percentage": round(attempt.score / attempt.total_points * 100) if attempt.total_points else 0,
            "submitted_date": attempt.submitted_date.isoformat(),
        }
    }


@router.get("/admin")
def admin_list_partners(
    search: str = Query(default="", max_length=200),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    partners = session.exec(select(Partner).order_by(Partner.created_date.desc())).all()
    result = []
    needle = search.strip().casefold()
    for partner in partners:
        account = session.get(User, partner.account_user_id)
        if not account:
            continue
        if needle and not any(
            needle in value.casefold()
            for value in (partner.name, partner.institution_type, account.email, account.full_name or "")
        ):
            continue
        result.append(_partner_dict(
            partner, account,
            _member_count(session, partner.id),
            _member_count(session, partner.id, "doctor"),
        ))
    return {"partners": result, "total": len(result)}


@router.post("/admin", status_code=201)
def admin_create_partner(
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    name = _clean(data.get("name"))
    email = _clean(data.get("email")).lower()
    password = data.get("password") or ""
    institution_type = _clean(data.get("institution_type")) or "educational_institution"
    learning_mode = _clean(data.get("learning_mode")) or "student_discovery"
    plan = _clean(data.get("subscription_plan")).upper() or "PRO"
    if not name or len(name) > 160:
        raise HTTPException(status_code=422, detail="Partner name is required and must be at most 160 characters")
    if not EMAIL_RE.fullmatch(email) or len(email) > 254:
        raise HTTPException(status_code=422, detail="A valid partner email address is required")
    if len(password) < 8 or len(password) > 72:
        raise HTTPException(status_code=422, detail="Password must be 8 to 72 characters")
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if institution_type not in VALID_TYPES or learning_mode not in VALID_MODES or plan not in VALID_PLANS:
        raise HTTPException(status_code=422, detail="Invalid institution type, learning mode, or subscription plan")
    try:
        subscription_days = int(data.get("subscription_days") or 30)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Subscription duration must be a number of days") from exc
    if not 1 <= subscription_days <= 3650:
        raise HTTPException(status_code=422, detail="Subscription duration must be between 1 and 3650 days")
    max_students = data.get("max_students")
    if max_students not in (None, ""):
        try:
            max_students = int(max_students)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="Student limit must be a positive number") from exc
        if not 1 <= max_students <= 100000:
            raise HTTPException(status_code=422, detail="Student limit must be between 1 and 100000")
    else:
        max_students = None
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=_clean(data.get("full_name")) or name,
        role="partner",
        status="active",
        subscription_status="none",
    )
    session.add(user)
    session.flush()
    partner = Partner(
        account_user_id=user.id,
        name=name,
        institution_type=institution_type,
        status="active",
        learning_mode=learning_mode,
        assigned_track=None,
        subscription_plan=plan,
        subscription_status="active",
        subscription_start=datetime.utcnow(),
        subscription_expires=datetime.utcnow() + timedelta(days=subscription_days),
        max_students=max_students,
        features=DEFAULT_FEATURES[plan].copy(),
    )
    session.add(partner)
    session.commit()
    session.refresh(partner)
    return _partner_dict(partner, user)


@router.get("/admin/{partner_id}")
def admin_partner_details(
    partner_id: str,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    partner = session.get(Partner, partner_id)
    account = session.get(User, partner.account_user_id) if partner else None
    if not partner or not account:
        raise HTTPException(status_code=404, detail="Partner not found")
    roster = _dashboard(session, partner, None, include_inactive=True)
    doctors = session.exec(
        select(PartnerMember).where(
            PartnerMember.partner_id == partner.id,
            PartnerMember.member_type == "doctor",
        ).order_by(PartnerMember.created_date.desc())
    ).all()
    roster["partner"] = _partner_dict(
        partner, account, roster["stats"]["students"],
        len([doctor for doctor in doctors if doctor.status == "active"]),
    )
    roster["doctors"] = [
        {
            "id": member.user_id,
            "full_name": account.full_name,
            "email": account.email,
            "phone": account.phone_e164 or account.phone_number,
            "username": member.username,
            "national_id": member.national_id,
            "member_type": member.member_type,
            "status": member.status,
        }
        for member in doctors
        if (account := session.get(User, member.user_id))
    ]
    return roster


@router.put("/admin/{partner_id}")
def admin_update_partner(
    partner_id: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    partner = session.get(Partner, partner_id)
    account = session.get(User, partner.account_user_id) if partner else None
    if not partner or not account:
        raise HTTPException(status_code=404, detail="Partner not found")
    if "name" in data:
        name = _clean(data["name"])
        if not name or len(name) > 160:
            raise HTTPException(status_code=422, detail="Partner name is required")
        partner.name = name
    if "full_name" in data:
        account.full_name = _clean(data["full_name"]) or partner.name
    if "email" in data:
        email = _clean(data["email"]).lower()
        if not EMAIL_RE.fullmatch(email) or len(email) > 254:
            raise HTTPException(status_code=422, detail="Invalid email address")
        other = session.exec(select(User).where(User.email == email, User.id != account.id)).first()
        if other:
            raise HTTPException(status_code=409, detail="Email already registered")
        account.email = email
    if data.get("password"):
        password = data["password"]
        if not isinstance(password, str) or not 8 <= len(password) <= 72:
            raise HTTPException(status_code=422, detail="Password must be 8 to 72 characters")
        account.password_hash = hash_password(password)
    if "institution_type" in data:
        if data["institution_type"] not in VALID_TYPES:
            raise HTTPException(status_code=422, detail="Invalid institution type")
        partner.institution_type = data["institution_type"]
    if "learning_mode" in data:
        if data["learning_mode"] not in VALID_MODES:
            raise HTTPException(status_code=422, detail="Invalid learning mode")
        _migrate_legacy_assigned_track(partner)
        partner.learning_mode = data["learning_mode"]
    if "assigned_track" in data:
        partner.assigned_track = _clean(data["assigned_track"]) or None
    if "status" in data:
        if data["status"] not in {"active", "suspended", "deleted"}:
            raise HTTPException(status_code=422, detail="Invalid partner status")
        partner.status = data["status"]
    if "max_students" in data:
        value = data["max_students"]
        if value in (None, ""):
            partner.max_students = None
        else:
            try:
                value = int(value)
            except (TypeError, ValueError) as exc:
                raise HTTPException(status_code=422, detail="Student limit must be numeric") from exc
            if value < _member_count(session, partner.id) or value > 100000:
                raise HTTPException(status_code=422, detail="Student limit cannot be below current enrollment")
            partner.max_students = value
    if "subscription_plan" in data:
        plan = _clean(data["subscription_plan"]).upper()
        if plan not in VALID_PLANS:
            raise HTTPException(status_code=422, detail="Invalid subscription plan")
        partner.subscription_plan = plan
        partner.features = DEFAULT_FEATURES[plan].copy()
    if "subscription_status" in data:
        if data["subscription_status"] not in {"active", "suspended", "expired"}:
            raise HTTPException(status_code=422, detail="Invalid subscription status")
        partner.subscription_status = data["subscription_status"]
    for field in ("subscription_start", "subscription_expires"):
        if field in data:
            value = data[field]
            if value in (None, ""):
                setattr(partner, field, None)
            else:
                if not isinstance(value, str):
                    raise HTTPException(status_code=422, detail=f"{field} must be an ISO date or datetime")
                try:
                    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                except ValueError as exc:
                    raise HTTPException(status_code=422, detail=f"{field} must be an ISO date or datetime") from exc
                if parsed.tzinfo:
                    parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
                elif field == "subscription_expires" and "T" not in value:
                    parsed += timedelta(days=1, microseconds=-1)
                setattr(partner, field, parsed)
    if "features" in data:
        features = data["features"]
        if not isinstance(features, dict) or set(features) - VALID_FEATURES:
            raise HTTPException(status_code=422, detail="Invalid partner feature settings")
        if any(not isinstance(value, bool) for value in features.values()):
            raise HTTPException(status_code=422, detail="Partner feature values must be boolean")
        partner.features = {key: bool(features.get(key, False)) for key in VALID_FEATURES}
    partner.updated_date = datetime.utcnow()
    account.status = "active" if partner.status == "active" else "suspended"
    if "learning_mode" in data or "assigned_track" in data:
        _update_unstarted_student_profiles(session, partner)
    account.updated_date = datetime.utcnow()
    session.add(partner)
    session.add(account)
    session.commit()
    return _partner_dict(partner, account, _member_count(session, partner.id), _member_count(session, partner.id, "doctor"))


@router.post("/admin/{partner_id}/subscription/extend")
def admin_extend_subscription(
    partner_id: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    partner = session.get(Partner, partner_id)
    account = session.get(User, partner.account_user_id) if partner else None
    if not partner or not account:
        raise HTTPException(status_code=404, detail="Partner not found")
    try:
        days = int(data.get("days"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Days must be an integer") from exc
    if not -3650 <= days <= 3650 or days == 0:
        raise HTTPException(status_code=422, detail="Days must be between -3650 and 3650, excluding zero")
    now = datetime.utcnow()
    start = partner.subscription_expires if partner.subscription_expires and partner.subscription_expires > now else now
    partner.subscription_expires = start + timedelta(days=days)
    partner.subscription_status = "active" if partner.subscription_expires > now else "expired"
    partner.status = "active" if partner.subscription_status == "active" else partner.status
    partner.updated_date = now
    if account:
        account.status = "active" if partner.status == "active" and partner.subscription_status == "active" else "suspended"
        account.updated_date = now
        session.add(account)
    session.add(partner)
    session.commit()
    return _partner_dict(partner, account, _member_count(session, partner.id), _member_count(session, partner.id, "doctor"))


@router.delete("/admin/{partner_id}")
def admin_delete_partner(
    partner_id: str,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    partner.status = "deleted"
    partner.subscription_status = "suspended"
    partner.updated_date = datetime.utcnow()
    account = session.get(User, partner.account_user_id)
    if account:
        account.status = "suspended"
        account.updated_date = partner.updated_date
        session.add(account)
    session.add(partner)
    session.commit()
    return {"ok": True}


@router.post("/admin/{partner_id}/members", status_code=201)
def admin_add_member(
    partner_id: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    _assert_partner_active(partner)
    member_type = _clean(data.get("member_type")) or "student"
    if member_type != "student":
        raise HTTPException(status_code=422, detail="Partner organizations can only create student accounts")
    _assert_capacity(session, partner)
    try:
        user, member = _create_member(session, partner, data, member_type)
        session.commit()
    except Exception:
        session.rollback()
        raise
    return {"member": _student_snapshot(session, user, member) if member_type == "student" else {
        "id": user.id, "full_name": user.full_name, "email": user.email, "member_type": member_type,
    }}


@router.put("/admin/{partner_id}/members/{user_id}")
def admin_update_member(
    partner_id: str,
    user_id: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    member = session.exec(
        select(PartnerMember).where(
            PartnerMember.partner_id == partner_id,
            PartnerMember.user_id == user_id,
        )
    ).first()
    account = session.get(User, user_id)
    if not member or not account:
        raise HTTPException(status_code=404, detail="Partner member not found")
    if "doctor_id" in data:
        raise HTTPException(status_code=422, detail="Students are managed directly by their partner organization")
    if "full_name" in data:
        name = _clean(data["full_name"])
        if not name or len(name) > 160:
            raise HTTPException(status_code=422, detail="Full name is required")
        account.full_name = name
    if "email" in data:
        email = _clean(data["email"]).lower()
        if not EMAIL_RE.fullmatch(email) or len(email) > 254:
            raise HTTPException(status_code=422, detail="Invalid email address")
        if session.exec(select(User).where(User.email == email, User.id != account.id)).first():
            raise HTTPException(status_code=409, detail="Email already registered")
        account.email = email
    if "phone" in data:
        account.phone_number = _clean(data["phone"]) or None
    if "national_id" in data:
        member.national_id = _clean(data["national_id"]) or None
    if "username" in data:
        username = _clean(data["username"])
        if username:
            if len(username) > 64 or not re.fullmatch(r"[\w.@+-]+", username, re.UNICODE):
                raise HTTPException(status_code=422, detail="Username contains unsupported characters")
            other = session.exec(select(PartnerMember).where(
                func.lower(PartnerMember.username) == username.lower(),
                PartnerMember.user_id != account.id,
            )).first()
            if other:
                raise HTTPException(status_code=409, detail="Username already registered")
            old_email = account.email
            member.username = username
            if old_email.endswith("@partner.zeus"):
                new_email = f"{username.lower()}@partner.zeus"
                if session.exec(select(User).where(User.email == new_email, User.id != account.id)).first():
                    raise HTTPException(status_code=409, detail="Username already registered")
                account.email = new_email
        else:
            member.username = None
    if "status" in data:
        if data["status"] not in {"active", "suspended"}:
            raise HTTPException(status_code=422, detail="Invalid member status")
        member.status = data["status"]
        account.status = data["status"]
    if data.get("password"):
        password = data["password"]
        if not isinstance(password, str) or not 8 <= len(password) <= 72:
            raise HTTPException(status_code=422, detail="Password must be 8 to 72 characters")
        account.password_hash = hash_password(password)
    account.updated_date = datetime.utcnow()
    member.updated_date = datetime.utcnow()
    session.add(account)
    session.add(member)
    session.commit()
    return {"ok": True}


@router.delete("/admin/{partner_id}/members/{user_id}")
def admin_remove_member(
    partner_id: str,
    user_id: str,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    member = session.exec(
        select(PartnerMember).where(
            PartnerMember.partner_id == partner_id,
            PartnerMember.user_id == user_id,
        )
    ).first()
    account = session.get(User, user_id)
    if not member or not account:
        raise HTTPException(status_code=404, detail="Partner member not found")
    member.status = "suspended"
    member.updated_date = datetime.utcnow()
    account.status = "suspended"
    account.updated_date = datetime.utcnow()
    session.add(member)
    session.add(account)
    session.commit()
    return {"ok": True}


@router.get("/admin/{partner_id}/students/export.xlsx")
def admin_export_partner_students(
    partner_id: str,
    search: str = Query(default="", max_length=160),
    status: str = Query(default="all"),
    performance: str = Query(default="all"),
    sort: str = Query(default="performance_desc"),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    dashboard = _dashboard(session, partner, None, include_inactive=True)
    students = _filter_student_snapshots(
        dashboard["students"],
        search=search,
        status=status,
        performance=performance,
        sort=sort,
    )
    return _student_export(students, partner.name)


@router.get("/admin/{partner_id}/students/{student_id}")
def admin_partner_student(
    partner_id: str,
    student_id: str,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    member = _member_for_user(session, partner.id, student_id, include_inactive=True)
    student = session.get(User, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return _student_snapshot(session, student, member)


@router.get("/dashboard")
def partner_dashboard(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    result = _dashboard(session, partner, instructor)
    features = partner.features or DEFAULT_FEATURES.get(partner.subscription_plan, {})
    if not partner_feature_enabled(user, session, "statistics"):
        result["stats"] = {}
        result["top_students"] = []
        statistics_fields = {
            "roadmap_status", "roadmaps", "lessons_total", "lessons_completed", "lessons",
            "progress_percent", "capstone_exists", "capstone_completed", "quiz_attempts",
            "average_quiz_score", "exam_results", "exam_attempt_count", "skills",
            "average_exam_score", "performance_score", "performance_band", "has_learning_activity",
            "quiz_topics", "strength_topics", "weak_topics", "learning_status",
            "target_skills", "national_id", "profile",
        }
        for student in result["students"]:
            for field in statistics_fields:
                student.pop(field, None)
    if not features.get("projects", False):
        for student in result["students"]:
            student.pop("projects", None)
    if not features.get("portfolio", False):
        for student in result["students"]:
            student.pop("cv_url", None)
            student.pop("cv_updated_date", None)
    result["partner"] = {
        "name": partner.name,
        "institution_type": partner.institution_type,
        "learning_mode": _public_learning_mode(partner),
        "doctor_track": _doctor_track_config(partner),
        "subscription_plan": partner.subscription_plan,
        "subscription_expires": partner.subscription_expires.isoformat() if partner.subscription_expires else None,
        "features": features,
    }
    result["role"] = user.role
    return result


@router.get("/student-learning-context")
def partner_student_learning_context(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if user.role != "partner_student":
        raise HTTPException(status_code=403, detail="Partner student access required")
    membership = session.exec(
        select(PartnerMember).where(
            PartnerMember.user_id == user.id,
            PartnerMember.member_type == "student",
            PartnerMember.status == "active",
        )
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Active partner student membership required")
    partner = session.get(Partner, membership.partner_id)
    if not partner:
        raise HTTPException(status_code=403, detail="Partner account is not configured")
    _assert_partner_active(partner)
    if not partner_feature_enabled(user, session, "learning"):
        raise HTTPException(status_code=403, detail="Learning is not enabled for this partner")
    doctor_track = _doctor_track_config(partner)
    if partner.learning_mode != "student_discovery" and not _clean(doctor_track.get("track")):
        return {
            "learning_mode": _public_learning_mode(partner),
            "ready": False,
            "track": "",
            "skills": [],
            "topics": [],
            "instructions": "",
        }
    profile = session.exec(
        select(LearningProfile).where(LearningProfile.user_id == user.id)
        .order_by(LearningProfile.updated_date.desc())
    ).first()
    has_roadmap = bool(
        session.exec(select(Roadmap.id).where(Roadmap.user_id == user.id)).first()
    )
    track, skills = _assigned_learning(partner)
    if (
        profile
        and not has_roadmap
        and profile.onboarding_step != "done"
        and partner.learning_mode != "student_discovery"
        and profile.onboarding_step != "partner_intake"
    ):
        profile.goal = track
        profile.target_skills = skills
        profile.onboarding_step = "partner_intake"
        profile.updated_date = datetime.utcnow()
        session.add(profile)
        session.commit()
    return {
        "learning_mode": _public_learning_mode(partner),
        "ready": True,
        "track": track,
        "skills": skills,
        "topics": doctor_track.get("topics", []),
        "instructions": doctor_track.get("instructions", ""),
        "has_roadmap": has_roadmap,
    }


@router.get("/members")
def partner_members(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    query = select(PartnerMember).where(PartnerMember.partner_id == partner.id, PartnerMember.status == "active")
    if instructor:
        query = query.where(PartnerMember.member_type == "student", PartnerMember.doctor_id == user.id)
    members = session.exec(query.order_by(PartnerMember.created_date.desc()).limit(1000)).all()
    output = []
    for member in members:
        account = session.get(User, member.user_id)
        if not account:
            continue
        output.append({
            "id": account.id,
            "full_name": account.full_name,
            "email": None if account.email.endswith("@partner.zeus") else account.email,
            "username": member.username,
            "phone": account.phone_e164 or account.phone_number,
            "member_type": member.member_type,
            "status": member.status,
            "doctor_id": member.doctor_id,
        })
    return {"members": output}


@router.post("/members", status_code=201)
def partner_add_member(
    data: dict = Body(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    member_type = _clean(data.get("member_type")) or "student"
    if member_type != "student":
        raise HTTPException(status_code=422, detail="Partner organizations can only create student accounts")
    _assert_capacity(session, partner)
    try:
        account, member = _create_member(
            session,
            partner,
            data,
            member_type,
            instructor.user_id if instructor else None,
        )
        session.commit()
    except Exception:
        session.rollback()
        raise
    return {"member": _student_snapshot(session, account, member) if member_type == "student" else {
        "id": account.id, "full_name": account.full_name, "email": account.email, "member_type": member_type,
    }}


@router.put("/members/{user_id}")
def partner_update_member(
    user_id: str,
    data: dict = Body(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, instructor = _partner_context(user, session)
    member = session.exec(
        select(PartnerMember).where(
            PartnerMember.partner_id == partner.id, PartnerMember.user_id == user_id
        )
    ).first()
    account = session.get(User, user_id)
    if not member or not account or member.status != "active":
        raise HTTPException(status_code=404, detail="Member not found")
    if "doctor_id" in data:
        raise HTTPException(status_code=422, detail="Students are managed directly by their partner organization")
    if instructor and (member.member_type != "student" or member.doctor_id != user.id):
        raise HTTPException(status_code=404, detail="Member not found")
    if "full_name" in data:
        full_name = _clean(data["full_name"])
        if not full_name or len(full_name) > 160:
            raise HTTPException(status_code=422, detail="Full name is required")
        account.full_name = full_name
    if "phone" in data:
        account.phone_number = _clean(data["phone"]) or None
    if "email" in data:
        email = _clean(data["email"]).lower()
        if not EMAIL_RE.fullmatch(email) or len(email) > 254:
            raise HTTPException(status_code=422, detail="Invalid email address")
        if session.exec(select(User).where(User.email == email, User.id != account.id)).first():
            raise HTTPException(status_code=409, detail="Email already registered")
        account.email = email
    if "national_id" in data:
        member.national_id = _clean(data["national_id"]) or None
    if "username" in data:
        username = _clean(data["username"])
        if username:
            if len(username) > 64 or not re.fullmatch(r"[\w.@+-]+", username, re.UNICODE):
                raise HTTPException(status_code=422, detail="Username contains unsupported characters")
            other = session.exec(select(PartnerMember).where(
                func.lower(PartnerMember.username) == username.lower(),
                PartnerMember.user_id != account.id,
            )).first()
            if other:
                raise HTTPException(status_code=409, detail="Username already registered")
            old_email = account.email
            member.username = username
            if old_email.endswith("@partner.zeus"):
                new_email = f"{username.lower()}@partner.zeus"
                if session.exec(select(User).where(User.email == new_email, User.id != account.id)).first():
                    raise HTTPException(status_code=409, detail="Username already registered")
                account.email = new_email
        else:
            member.username = None
    if data.get("password"):
        password = data["password"]
        if not isinstance(password, str) or not 8 <= len(password) <= 72:
            raise HTTPException(status_code=422, detail="Password must be 8 to 72 characters")
        account.password_hash = hash_password(password)
    account.updated_date = datetime.utcnow()
    member.updated_date = datetime.utcnow()
    session.add(account)
    session.add(member)
    session.commit()
    return {"ok": True}


@router.delete("/members/{user_id}")
def partner_remove_member(
    user_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, instructor = _partner_context(user, session)
    member = session.exec(
        select(PartnerMember).where(
            PartnerMember.partner_id == partner.id, PartnerMember.user_id == user_id
        )
    ).first()
    account = session.get(User, user_id)
    if not member or not account:
        raise HTTPException(status_code=404, detail="Member not found")
    if instructor:
        raise HTTPException(status_code=403, detail="Instructors cannot remove members")
    _can_manage_student(user, instructor, member)
    member.status = "suspended"
    member.updated_date = datetime.utcnow()
    account.status = "suspended"
    account.updated_date = datetime.utcnow()
    session.add(member)
    session.add(account)
    session.commit()
    return {"ok": True}


@router.put("/track")
def partner_update_track(
    data: dict = Body(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, _ = _partner_context(user, session)
    _assert_partner_active(partner)
    if partner.learning_mode == "student_discovery":
        raise HTTPException(status_code=403, detail="Instructor track editing is not enabled while discovery is on")
    if user.role != "partner":
        raise HTTPException(status_code=403, detail="Partner organization account required")
    track = _clean(data.get("track"))
    skills = data.get("skills", [])
    topics = data.get("topics", [])
    if not track or len(track) > 200:
        raise HTTPException(status_code=422, detail="Track name is required")
    if not isinstance(skills, list) or len(skills) > 100 or any(not isinstance(item, str) or len(item) > 120 for item in skills):
        raise HTTPException(status_code=422, detail="Skills must be a list of up to 100 short labels")
    if not isinstance(topics, list) or len(topics) > 100 or any(not isinstance(item, str) or len(item) > 200 for item in topics):
        raise HTTPException(status_code=422, detail="Topics must be a list of up to 100 short labels")
    instructions = data.get("instructions", "")
    if not isinstance(instructions, str) or len(instructions) > 5000:
        raise HTTPException(status_code=422, detail="Instructions must be at most 5000 characters")
    partner.doctor_track = {
        "track": track,
        "skills": list(dict.fromkeys(_clean(item) for item in skills if _clean(item))),
        "topics": list(dict.fromkeys(_clean(item) for item in topics if _clean(item))),
        "instructions": instructions.strip(),
        "updated_by": user.id,
        "updated_at": datetime.utcnow().isoformat(),
    }
    partner.learning_mode = "doctor_assigned"
    partner.updated_date = datetime.utcnow()
    _update_unstarted_student_profiles(session, partner)
    session.add(partner)
    session.commit()
    return {"doctor_track": partner.doctor_track}


@router.put("/learning-mode")
def partner_update_learning_mode(
    data: dict = Body(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, _ = _partner_context(user, session)
    _assert_partner_active(partner)
    if user.role != "partner":
        raise HTTPException(status_code=403, detail="Partner organization account required")
    discovery_enabled = data.get("discovery_enabled")
    if not isinstance(discovery_enabled, bool):
        raise HTTPException(status_code=422, detail="discovery_enabled must be a boolean")
    if not discovery_enabled:
        _migrate_legacy_assigned_track(partner)
    partner.learning_mode = "student_discovery" if discovery_enabled else "doctor_assigned"
    partner.updated_date = datetime.utcnow()
    _update_unstarted_student_profiles(session, partner)
    session.add(partner)
    session.commit()
    return {"learning_mode": partner.learning_mode}


def _excel_rows(content: bytes):
    try:
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read the Excel file") from exc
    try:
        sheet = workbook.active
        iterator = sheet.iter_rows(values_only=True)
        headers = next(iterator, None)
        if not headers:
            raise HTTPException(status_code=422, detail="The Excel sheet is empty")
        columns = {}
        for index, header in enumerate(headers):
            label = _clean(header).casefold()
            for field, aliases in HEADER_ALIASES.items():
                if label in aliases:
                    columns[field] = index
        if "full_name" not in columns or not ({"email", "username"} & columns.keys()):
            raise HTTPException(
                status_code=422,
                detail="Excel headers must include full_name and email or username",
            )
        rows = []
        for row_number, values in enumerate(iterator, start=2):
            if not any(_clean(value) for value in values):
                continue
            if len(rows) >= 500:
                raise HTTPException(status_code=413, detail="Excel upload is limited to 500 students")
            rows.append({
                "row": row_number,
                **{
                    key: _clean(values[index] if index < len(values) else "")
                    for key, index in columns.items()
                },
            })
        return rows
    finally:
        workbook.close()


def _preview_import(session: Session, partner: Partner, instructor: PartnerMember | None, rows: list):
    existing_emails = {
        value.casefold() for value in session.exec(select(User.email)).all()
    }
    existing_usernames = {
        value.casefold() for value in session.exec(select(PartnerMember.username)).all() if value
    }
    seen_emails, seen_usernames = set(), set()
    preview = []
    available = None if partner.max_students is None else max(
        0, partner.max_students - _member_count(session, partner.id)
    )
    valid_count = 0
    for row in rows:
        errors = []
        name = row.get("full_name", "")
        email = row.get("email", "").lower()
        username = row.get("username", "")
        if not name or len(name) > 160:
            errors.append("Full name is required")
        if not email:
            errors.append("Email is required")
        if email and (not EMAIL_RE.fullmatch(email) or len(email) > 254):
            errors.append("Invalid email")
        if username and (len(username) > 64 or not re.fullmatch(r"[\w.@+-]+", username, re.UNICODE)):
            errors.append("Invalid username")
        if not row.get("password") or not 8 <= len(row.get("password", "")) <= 72:
            errors.append("Password must be 8 to 72 characters")
        if not row.get("national_id"):
            errors.append("National ID is required")
        if email and (email in existing_emails or email in seen_emails):
            errors.append("Email is already registered or duplicated")
        if username and (username.casefold() in existing_usernames or username.casefold() in seen_usernames):
            errors.append("Username is already registered or duplicated")
        if email:
            seen_emails.add(email)
        if username:
            seen_usernames.add(username.casefold())
        if instructor:
            row["doctor_id"] = instructor.user_id
        if available is not None and valid_count >= available:
            errors.append("Partner student limit would be exceeded")
        is_valid = not errors
        valid_count += int(is_valid)
        preview.append({
            "row": row["row"],
            "full_name": name,
            "email": email or None,
            "username": username or None,
            "valid": is_valid,
            "errors": errors,
        })
    return preview


@router.post("/members/import")
async def import_students(
    confirm: bool = Query(default=False),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=415, detail="Upload an .xlsx Excel file")
    content = await file.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Excel file must be at most 10 MB")
    rows = _excel_rows(content)
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    if instructor is None and user.role not in {"partner", "admin"}:
        raise HTTPException(status_code=403, detail="Partner access required")
    preview = _preview_import(session, partner, instructor, rows)
    if not confirm:
        return {
            "preview": preview,
            "valid_count": sum(item["valid"] for item in preview),
            "error_count": sum(not item["valid"] for item in preview),
            "requires_confirmation": True,
        }
    valid_rows = {item["row"] for item in preview if item["valid"]}
    if not valid_rows:
        return {"created": 0, "skipped": len(rows), "preview": preview}
    by_row = {row["row"]: row for row in rows}
    created = 0
    try:
        for number in sorted(valid_rows):
            row = by_row[number]
            row["member_type"] = "student"
            _create_member(session, partner, row, "student", row.get("doctor_id"))
            created += 1
        session.commit()
    except Exception:
        session.rollback()
        raise
    return {"created": created, "skipped": len(rows) - created, "preview": preview}


@router.get("/members/import-template.xlsx")
def student_import_template(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    if instructor is None and user.role not in {"partner", "admin"}:
        raise HTTPException(status_code=403, detail="Partner access required")
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Students"
    sheet.append(["full_name", "email", "password", "national_id", "phone", "username"])
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="24314A")
    for column, width in zip("ABCDEF", (26, 32, 20, 20, 20, 24)):
        sheet.column_dimensions[column].width = width
    notes = workbook.create_sheet("Instructions")
    notes.append(["Column", "Required", "Description"])
    notes.append(["full_name", "Yes", "Student's full name"])
    notes.append(["email", "Yes", "Unique login email"])
    notes.append(["password", "Yes", "8 to 72 characters"])
    notes.append(["national_id", "Yes", "Student national ID"])
    notes.append(["phone", "No", "Optional phone number"])
    notes.append(["username", "No", "Optional login alias"])
    notes.freeze_panes = "A2"
    for cell in notes[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="24314A")
    notes.column_dimensions["A"].width = 24
    notes.column_dimensions["B"].width = 24
    notes.column_dimensions["C"].width = 44
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="zeus-student-import-template.xlsx"'},
    )


@router.get("/students/export.xlsx")
def partner_export_students(
    search: str = Query(default="", max_length=160),
    status: str = Query(default="all"),
    performance: str = Query(default="all"),
    sort: str = Query(default="performance_desc"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    if not partner_feature_enabled(user, session, "statistics"):
        raise HTTPException(status_code=403, detail="Student statistics are not enabled for this partner")
    dashboard = _dashboard(session, partner, instructor)
    students = _filter_student_snapshots(
        dashboard["students"],
        search=search,
        status=status,
        performance=performance,
        sort=sort,
    )
    return _student_export(students, partner.name)


@router.get("/students/{student_id}")
def partner_student_details(
    student_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    partner, instructor = _partner_context(user, session)
    _assert_partner_active(partner)
    if not partner_feature_enabled(user, session, "statistics"):
        raise HTTPException(status_code=403, detail="Student statistics are not enabled for this partner")
    member = _member_for_user(session, partner.id, student_id)
    _can_manage_student(user, instructor, member)
    student = session.get(User, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    snapshot = _student_snapshot(session, student, member)
    features = partner.features or DEFAULT_FEATURES.get(partner.subscription_plan, {})
    if not features.get("projects", False):
        snapshot.pop("projects", None)
    if not features.get("portfolio", False):
        snapshot.pop("cv_url", None)
        snapshot.pop("cv_updated_date", None)
    return snapshot
