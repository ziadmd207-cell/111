"""
Admin backend: stats, users, communities, moderation, broadcasts.
All routes require an admin token (403 otherwise).
"""
from datetime import datetime, timedelta, timezone
from io import BytesIO
import logging
import math
import re

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from sqlmodel import Session, select, func

from ..core.database import get_session
from ..core.deps import require_admin
from ..core.security import hash_password
from ..models import (
    User, LearningProfile, Roadmap, Task, Lesson, LessonProgress,
    GenerationJob, Conversation, Project, CV, Notification,
    Community, CommunityMessage, SubscriptionRequest, AdminSetting, SupportRequest,
    SupportChat, SupportChatMessage, Certificate, PartnerMember,
    PartnerAssessment, PartnerAssessmentAttempt,
)
from .support import SOCIAL_FIELDS, _delete_chat_attachments, _safe_social_url, _safe_whatsapp_url

router = APIRouter()
logger = logging.getLogger(__name__)


def _parse_subscription_datetime(value, field_name: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(status_code=400, detail=f"{field_name} must be an ISO date or datetime")
    try:
        parsed = datetime.fromisoformat(value.strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be an ISO date or datetime") from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    elif field_name == "subscription_expires" and "T" not in value:
        parsed += timedelta(days=1, microseconds=-1)
    return parsed


OWNED_TABLES = [
    LearningProfile, Roadmap, Task, Lesson, LessonProgress, GenerationJob,
    Conversation, Project, CV, Notification, CommunityMessage, SubscriptionRequest,
    Certificate,
]
ADMIN_ACCOUNT_TYPES = {
    "all",
    "individual",
    "institution",
    "partner",
    "doctor",
    "partner_student",
    "admin",
}


def _matches_admin_account_type(user: User, account_type: str) -> bool:
    role = getattr(user, "role", "user") or "user"
    if account_type == "all":
        return True
    if account_type == "individual":
        return role == "user"
    if account_type == "institution":
        return role in {"partner", "doctor", "partner_student"}
    return role == account_type


def _day_str(dt) -> str:
    try:
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return ""


def _words(text: str) -> set:
    import re
    return {w for w in re.findall(r"[\w\u0600-\u06FF]{3,}", (text or "").lower())}


def _suggest_community(profile, communities):
    """Best community for a user from their DNA (goal + skills).

    Deterministic and explainable: goal-word overlap wins, shared skills add
    up. Returns {community_id, name, reason} or None.
    """
    if profile is None or not communities:
        return None
    goal = (profile.goal or "")
    skills = set()
    for s in (profile.skill_graph or []):
        if isinstance(s, dict) and s.get("skill"):
            skills.add(str(s["skill"]).lower())
    for s in (profile.known_skills or []) + (profile.target_skills or []):
        skills.add(str(s).lower())
    goal_words = _words(goal)
    best, best_score, best_reason = None, 0, ""
    for c in communities:
        ctext = f"{c.name or ''} {c.goal or ''} {c.stage or ''}"
        cwords = _words(ctext)
        overlap = goal_words & cwords
        shared_skills = {s for s in skills if s and s in ctext.lower()}
        score = len(overlap) * 3 + min(3, len(shared_skills))
        if score <= 0:
            continue
        if score > best_score:
            best, best_score = c, score
            bits = []
            if overlap:
                bits.append("نفس الهدف: " + "، ".join(sorted(overlap)[:3]))
            if shared_skills:
                bits.append("مهارات مشتركة: " + "، ".join(sorted(shared_skills)[:3]))
            best_reason = " + ".join(bits) if bits else "تطابق المجال"
    if not best:
        return None
    return {"community_id": best.id, "name": best.name, "reason": best_reason, "score": best_score}


def _dna_summary(profile) -> dict:
    if not profile:
        return {}
    days = profile.available_days or []
    return {
        "goal": profile.goal,
        "current_level": profile.current_level,
        "learning_style": profile.learning_style,
        "weekly_hours": profile.weekly_hours,
        "available_days": days,
        "video_preference": profile.video_preference,
        "obstacles": getattr(profile, "obstacles", None) if isinstance(getattr(profile, "obstacles", None), list) else [],
    }


def _admin_user_filter_data(session: Session, users: list[User], now: datetime):
    lesson_counts = {}
    for user_id, status in session.exec(select(Lesson.user_id, Lesson.status)).all():
        counts = lesson_counts.setdefault(user_id, [0, 0])
        counts[1] += 1
        if status == "completed":
            counts[0] += 1

    users_by_email = {(user.email or "").lower(): user.id for user in users}
    paid_user_ids = set()
    approved_requests = session.exec(
        select(SubscriptionRequest.user_id, SubscriptionRequest.email).where(
            SubscriptionRequest.status == "approved"
        )
    ).all()
    for user_id, email in approved_requests:
        if user_id:
            paid_user_ids.add(user_id)
        if email and (email.lower() in users_by_email):
            paid_user_ids.add(users_by_email[email.lower()])
    return lesson_counts, paid_user_ids


def _admin_user_tracks(session: Session) -> tuple[dict, dict, dict]:
    roadmaps = session.exec(select(Roadmap).order_by(Roadmap.created_date.desc())).all()
    latest = {}
    goals = {}
    statuses = {}
    for roadmap in roadmaps:
        latest.setdefault(roadmap.user_id, roadmap)
        statuses.setdefault(roadmap.user_id, roadmap.status)
        goals.setdefault(roadmap.user_id, []).append(roadmap.goal or "")
    return latest, goals, statuses


def _admin_user_performance(session: Session, users: list[User], lesson_counts: dict) -> dict:
    user_ids = [user.id for user in users]
    quiz_scores = {}
    exam_scores = {}
    if user_ids:
        progress_rows = session.exec(
            select(LessonProgress).where(LessonProgress.user_id.in_(user_ids))
        ).all()
        for progress in progress_rows:
            history = progress.quiz_answers.get("history", []) if isinstance(progress.quiz_answers, dict) else []
            scores = [
                max(0, min(100, float(item["score"])))
                for item in history
                if isinstance(item, dict) and isinstance(item.get("score"), (int, float))
            ] if isinstance(history, list) else []
            if not scores and progress.attempts > 0 and progress.quiz_score is not None:
                scores = [max(0, min(100, float(progress.quiz_score)))]
            quiz_scores.setdefault(progress.user_id, []).extend(scores)
        attempts = session.exec(
            select(PartnerAssessmentAttempt).where(
                PartnerAssessmentAttempt.user_id.in_(user_ids)
            )
        ).all()
        for attempt in attempts:
            if attempt.total_points:
                exam_scores.setdefault(attempt.user_id, []).append(
                    max(0, min(100, attempt.score / attempt.total_points * 100))
                )
    result = {}
    for user in users:
        completed, total = lesson_counts.get(user.id, (0, 0))
        progress_score = round(completed / total * 100) if total else 0
        quizzes = quiz_scores.get(user.id, [])
        exams = exam_scores.get(user.id, [])
        quiz_average = round(sum(quizzes) / len(quizzes)) if quizzes else 0
        exam_average = round(sum(exams) / len(exams)) if exams else 0
        components = [(progress_score, 0.4)] if total else []
        if quizzes:
            components.append((quiz_average, 0.4))
        if exams:
            components.append((exam_average, 0.2))
        score = round(
            sum(value * weight for value, weight in components)
            / sum(weight for _, weight in components)
        ) if components else 0
        result[user.id] = {
            "progress_percent": progress_score,
            "average_quiz_score": quiz_average,
            "average_exam_score": exam_average,
            "performance_score": score,
            "performance_band": "high" if score >= 80 else "average" if score >= 60 else "needs_support",
        }
    return result


def _filter_sort_admin_performance(users: list[User], metrics: dict, performance: str, sort: str) -> list[User]:
    bands = {"all", "high", "average", "needs_support"}
    sorters = {
        "performance_desc": lambda user: (-metrics[user.id]["performance_score"], (user.full_name or "").casefold()),
        "progress_desc": lambda user: (-metrics[user.id]["progress_percent"], (user.full_name or "").casefold()),
        "quiz_desc": lambda user: (-metrics[user.id]["average_quiz_score"], (user.full_name or "").casefold()),
        "exam_desc": lambda user: (-metrics[user.id]["average_exam_score"], (user.full_name or "").casefold()),
        "progress_asc": lambda user: (metrics[user.id]["progress_percent"], (user.full_name or "").casefold()),
        "name_asc": lambda user: ((user.full_name or "").casefold(),),
    }
    if performance not in bands:
        raise HTTPException(status_code=400, detail="Invalid performance filter")
    if sort not in sorters:
        raise HTTPException(status_code=400, detail="Invalid performance sort")
    filtered = [
        user for user in users
        if performance == "all" or metrics[user.id]["performance_band"] == performance
    ]
    return sorted(filtered, key=sorters[sort])


def _effective_subscription_status(user: User, now: datetime) -> str:
    if user.subscription_status == "active" and user.subscription_plan in ("STARTER", "PRO", "PRIME"):
        if user.subscription_start and user.subscription_start > now:
            return "none"
        if user.subscription_expires and user.subscription_expires <= now:
            return "expired"
        return "active"
    if user.subscription_status == "expired" or (
        user.subscription_expires and user.subscription_expires <= now
    ):
        return "expired"
    return "none"


def _filter_admin_users(
    users: list[User],
    lesson_counts: dict,
    paid_user_ids: set,
    track_goals: dict,
    track_statuses: dict,
    *,
    search: str,
    account_type: str,
    account_status: str,
    subscription_status: str,
    plan: str,
    payment_status: str,
    completion_status: str,
    learning_status: str,
    include_admins: bool,
    now: datetime,
) -> list[User]:
    filters = {
        "account_type": (account_type, ADMIN_ACCOUNT_TYPES),
        "account_status": (account_status, {"all", "pending", "active", "suspended"}),
        "subscription_status": (subscription_status, {"all", "active", "none", "expired"}),
        "plan": (plan, {"all", "STARTER", "PRO", "PRIME"}),
        "payment_status": (payment_status, {"all", "paid", "unpaid"}),
        "completion_status": (completion_status, {"all", "completed", "not_completed"}),
        "learning_status": (learning_status, {"all", "not_started", "active", "completed", "finished", "archived"}),
    }
    for name, (value, choices) in filters.items():
        if value not in choices:
            raise HTTPException(status_code=400, detail=f"Invalid {name} filter")

    query = (search or "").strip().lower()
    result = []
    for user in users:
        if not _matches_admin_account_type(user, account_type):
            continue
        if not include_admins and getattr(user, "role", "user") == "admin":
            continue
        if query and not any(
            query in value.lower()
            for value in (
                user.email or "",
                user.full_name or "",
                user.phone_number or "",
                user.phone_e164 or "",
                " ".join(track_goals.get(user.id, [])),
            )
        ):
            continue
        effective_account_status = getattr(user, "status", "active") or "active"
        effective_sub_status = _effective_subscription_status(user, now)
        if account_status != "all" and effective_account_status != account_status:
            continue
        if subscription_status != "all" and effective_sub_status != subscription_status:
            continue
        if plan != "all" and user.subscription_plan != plan:
            continue
        if learning_status != "all" and track_statuses.get(user.id, "not_started") != learning_status:
            continue
        is_paid = user.id in paid_user_ids
        if payment_status == "paid" and not is_paid:
            continue
        if payment_status == "unpaid" and is_paid:
            continue
        done, total = lesson_counts.get(user.id, (0, 0))
        completed = total > 0 and done == total
        if completion_status == "completed" and not completed:
            continue
        if completion_status == "not_completed" and completed:
            continue
        result.append(user)
    return result


@router.get("/stats")
def admin_stats(session: Session = Depends(get_session), admin: User = Depends(require_admin)):
    users = session.exec(select(User)).all()
    total_users = len(users)
    now = datetime.utcnow()
    new7 = sum(1 for u in users if u.created_date and (now - u.created_date).days < 7)
    new30 = sum(1 for u in users if u.created_date and (now - u.created_date).days < 30)
    roadmaps = session.exec(select(Roadmap)).all()
    active_roadmaps = sum(1 for r in roadmaps if r.status == "active")
    lessons = session.exec(select(Lesson)).all()
    lessons_done = sum(1 for l in lessons if l.status == "completed")
    progress_rows = session.exec(select(LessonProgress)).all()
    score_values = []
    for progress in progress_rows:
        history = progress.quiz_answers.get("history", []) if isinstance(progress.quiz_answers, dict) else []
        recorded = [
            attempt.get("score")
            for attempt in history
            if isinstance(attempt, dict) and attempt.get("score") is not None
        ] if isinstance(history, list) else []
        if not recorded and progress.attempts > 0 and progress.quiz_score is not None:
            recorded = [progress.quiz_score]
        for score in recorded:
            try:
                score_values.append(max(0, min(100, float(score))))
            except (TypeError, ValueError):
                continue
    avg_quiz = round(sum(score_values) / len(score_values), 1) if score_values else 0
    quiz_bands = [
        {"label": "<60%", "count": sum(score < 60 for score in score_values)},
        {"label": "60–79%", "count": sum(60 <= score < 80 for score in score_values)},
        {"label": "80–100%", "count": sum(score >= 80 for score in score_values)},
    ]
    communities = session.exec(select(Community)).all()
    members_total = sum(len(c.members or []) for c in communities)
    messages_total = session.exec(select(func.count(CommunityMessage.id))).one()
    # Top goals
    goals: dict = {}
    for r in roadmaps:
        if r.goal:
            goals[r.goal] = goals.get(r.goal, 0) + 1
    top_goals = [{"goal": g, "count": c} for g, c in sorted(goals.items(), key=lambda x: -x[1])[:6]]
    # Signups per day (last 30d)
    buckets: dict = {}
    for i in range(30):
        buckets[(now - timedelta(days=i)).strftime("%Y-%m-%d")] = 0
    for u in users:
        d = _day_str(u.created_date)
        if d in buckets:
            buckets[d] += 1
    signups = [{"day": d, "count": buckets[d]} for d in sorted(buckets)]
    return {
        "users": total_users, "new7": new7, "new30": new30,
        "roadmaps": len(roadmaps), "active_roadmaps": active_roadmaps,
        "lessons": len(lessons), "lessons_done": lessons_done,
        "avg_quiz": avg_quiz, "communities": len(communities),
        "quiz_attempts": len(score_values), "quiz_bands": quiz_bands,
        "members_total": members_total, "messages": messages_total,
        "top_goals": top_goals, "signups": signups,
    }


@router.get("/support-requests")
def admin_support_requests(
    status: str = Query(default=""),
    limit: int = Query(default=100, le=200),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    query = select(SupportRequest).order_by(SupportRequest.created_date.desc()).limit(limit)
    if status:
        if status not in {"open", "in_progress", "resolved", "closed"}:
            raise HTTPException(status_code=400, detail="Invalid support status")
        query = select(SupportRequest).where(SupportRequest.status == status).order_by(
            SupportRequest.created_date.desc()
        ).limit(limit)
    return [item.model_dump() for item in session.exec(query).all()]


@router.put("/support-requests/{request_id}")
def admin_update_support_request(
    request_id: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    item = session.get(SupportRequest, request_id)
    if not item:
        raise HTTPException(status_code=404, detail="Support request not found")
    status = data.get("status")
    if status not in {"open", "in_progress", "resolved", "closed"}:
        raise HTTPException(status_code=400, detail="Invalid support status")
    item.status = status
    item.updated_date = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return item.model_dump()


@router.get("/support-chats")
def admin_support_chats(
    limit: int = Query(default=100, le=200),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    latest_message_id = (
        select(SupportChatMessage.id)
        .where(SupportChatMessage.chat_id == SupportChat.id)
        .order_by(SupportChatMessage.created_date.desc())
        .limit(1)
        .correlate(SupportChat)
        .scalar_subquery()
    )
    rows = session.exec(
        select(SupportChat, SupportChatMessage)
        .outerjoin(SupportChatMessage, SupportChatMessage.id == latest_message_id)
        .order_by(SupportChat.updated_date.desc())
        .limit(limit)
    ).all()
    from .support import _message_dump

    return [
        {
            **chat.model_dump(),
            "last_message": _message_dump(message) if message else None,
        }
        for chat, message in rows
    ]


@router.get("/support-chats/{chat_id}")
def admin_support_chat(
    chat_id: str,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    chat = session.get(SupportChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Support chat not found")
    messages = session.exec(
        select(SupportChatMessage)
        .where(SupportChatMessage.chat_id == chat.id)
        .order_by(SupportChatMessage.created_date)
    ).all()
    chat.unread_admin = 0
    session.add(chat)
    from .support import _message_dump

    response = {
        "chat": chat.model_dump(),
        "messages": [_message_dump(item) for item in messages],
    }
    session.commit()
    return response


@router.post("/support-chats/{chat_id}/messages")
async def admin_reply_support_chat(
    chat_id: str,
    text: str = Form(default=""),
    files: list[UploadFile] = File(default=[]),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    message_text = text.strip()
    if len(message_text) > 3000:
        raise HTTPException(status_code=422, detail="Message must be 3000 characters or fewer")
    if not message_text and not files:
        raise HTTPException(status_code=422, detail="Write a message or attach a file")
    chat = session.get(SupportChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Support chat not found")

    from .support import _save_chat_attachments

    attachments = await _save_chat_attachments(files)
    now = datetime.utcnow()
    message = SupportChatMessage(
        chat_id=chat.id,
        sender_type="admin",
        sender_user_id=admin.id,
        text=message_text,
        attachments=attachments,
        created_date=now,
    )
    chat.unread_user += 1
    chat.updated_date = now
    session.add(message)
    session.add(chat)
    try:
        session.commit()
        session.refresh(message)
        session.refresh(chat)
    except Exception:
        session.rollback()
        import os
        from .support import UPLOADS_DIR
        for item in attachments:
            try:
                os.remove(os.path.join(UPLOADS_DIR, os.path.basename(item["url"])))
            except OSError:
                pass
        raise
    from .support import _message_dump

    return {"chat": chat.model_dump(), "message": _message_dump(message)}


@router.get("/users")
def admin_users(
    search: str = Query(default=""), limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    account_type: str = "all",
    account_status: str = "all",
    subscription_status: str = "all",
    plan: str = "all",
    payment_status: str = "all",
    completion_status: str = "all",
    learning_status: str = "all",
    performance: str = "all",
    sort: str = "performance_desc",
    include_admins: bool = True,
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    now = datetime.utcnow()
    users = session.exec(select(User).order_by(User.created_date.desc())).all()
    lesson_counts, paid_user_ids = _admin_user_filter_data(session, users, now)
    latest_tracks, track_goals, track_statuses = _admin_user_tracks(session)
    users = _filter_admin_users(
        users,
        lesson_counts,
        paid_user_ids,
        track_goals,
        track_statuses,
        search=search,
        account_type=account_type,
        account_status=account_status,
        subscription_status=subscription_status,
        plan=plan,
        payment_status=payment_status,
        completion_status=completion_status,
        learning_status=learning_status,
        include_admins=include_admins,
        now=now,
    )
    performance_data = _admin_user_performance(session, users, lesson_counts)
    users = _filter_sort_admin_performance(users, performance_data, performance, sort)
    total_users = len(users)
    communities = session.exec(select(Community)).all()
    out = []
    for u in users[offset:offset + limit]:
        prof = session.exec(
            select(LearningProfile).where(LearningProfile.user_id == u.id).order_by(LearningProfile.created_date.desc())
        ).first()
        done = session.exec(select(func.count(Lesson.id)).where(Lesson.user_id == u.id, Lesson.status == "completed")).one()
        total = session.exec(select(func.count(Lesson.id)).where(Lesson.user_id == u.id)).one()
        memberships = [{"id": c.id, "name": c.name} for c in communities if u.id in (c.members or [])]
        member_ids = {c.id for c in communities if u.id in (c.members or [])}
        suggested = _suggest_community(prof, [c for c in communities if c.id not in member_ids])
        out.append({
            "id": u.id, "email": u.email, "full_name": u.full_name,
            "phone_country": u.phone_country,
            "phone_country_code": u.phone_country_code,
            "phone_number": u.phone_number,
            "phone_e164": u.phone_e164,
            "role": getattr(u, "role", "user") or "user",
            "status": getattr(u, "status", "active") or "active",
            "subscription_plan": getattr(u, "subscription_plan", None),
            "subscription_status": getattr(u, "subscription_status", "none") or "none",
            "effective_subscription_status": _effective_subscription_status(u, now),
            "payment_status": "paid" if u.id in paid_user_ids else "unpaid",
            "subscription_start": u.subscription_start.isoformat() if getattr(u, "subscription_start", None) else None,
            "subscription_expires": u.subscription_expires.isoformat() if getattr(u, "subscription_expires", None) else None,
            "created_date": u.created_date.isoformat() if u.created_date else None,
            "goal": prof.goal if prof else None,
            "onboarding_step": prof.onboarding_step if prof else None,
            "lessons_done": done, "lessons_total": total,
            "completion_status": "completed" if total > 0 and done == total else "not_completed",
            "learning_status": latest_tracks[u.id].status if u.id in latest_tracks else "not_started",
            **performance_data[u.id],
            "latest_track": latest_tracks[u.id].goal if u.id in latest_tracks else None,
            "dna": _dna_summary(prof),
            "memberships": memberships,
            "suggested": suggested,
        })
    return {"users": out, "total": total_users}


@router.post("/users")
def admin_create_user(
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    email = str(data.get("email") or "").strip().lower()
    password = data.get("password")
    full_name = str(data.get("full_name") or "").strip()
    phone_number = str(data.get("phone_number") or "").strip()
    plan = data.get("subscription_plan") or None
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254:
        raise HTTPException(status_code=400, detail="Invalid email address")
    if not isinstance(password, str) or not 8 <= len(password) <= 72:
        raise HTTPException(status_code=400, detail="Password must be 8-72 characters")
    if not full_name or len(full_name) > 160:
        raise HTTPException(status_code=400, detail="Full name must be between 1 and 160 characters")
    if len(phone_number) > 32:
        raise HTTPException(status_code=400, detail="Phone number must be 32 characters or fewer")
    if plan not in (None, "STARTER", "PRO", "PRIME"):
        raise HTTPException(status_code=400, detail="Invalid subscription plan")
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    now = datetime.utcnow()
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        phone_number=phone_number or None,
        status="active" if plan else "pending",
        subscription_plan=plan,
        subscription_status="active" if plan else "none",
        subscription_start=now if plan else None,
        subscription_expires=now + timedelta(days=30) if plan else None,
        created_date=now,
        updated_date=now,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "status": user.status,
        "subscription_plan": user.subscription_plan,
        "subscription_status": user.subscription_status,
    }


@router.get("/users/export.xlsx")
def admin_export_users(
    search: str = Query(default=""),
    account_type: str = "all",
    account_status: str = "all",
    subscription_status: str = "all",
    plan: str = "all",
    payment_status: str = "all",
    completion_status: str = "all",
    learning_status: str = "all",
    performance: str = "all",
    sort: str = "performance_desc",
    include_admins: bool = False,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    now = datetime.utcnow()
    all_users = session.exec(select(User).order_by(User.created_date.desc())).all()
    lesson_counts, paid_user_ids = _admin_user_filter_data(session, all_users, now)
    _, track_goals, track_statuses = _admin_user_tracks(session)
    users = _filter_admin_users(
        all_users,
        lesson_counts,
        paid_user_ids,
        track_goals,
        track_statuses,
        search=search,
        account_type=account_type,
        account_status=account_status,
        subscription_status=subscription_status,
        plan=plan,
        payment_status=payment_status,
        completion_status=completion_status,
        learning_status=learning_status,
        include_admins=include_admins,
        now=now,
    )
    performance_data = _admin_user_performance(session, users, lesson_counts)
    users = _filter_sort_admin_performance(users, performance_data, performance, sort)
    profiles = session.exec(
        select(LearningProfile).order_by(LearningProfile.created_date.desc())
    ).all()
    profile_by_user = {}
    for profile in profiles:
        profile_by_user.setdefault(profile.user_id, profile)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "المستخدمون"
    headers = [
        "الاسم", "البريد الإلكتروني", "الدولة", "كود الدولة", "رقم الهاتف", "الهاتف الدولي",
        "حالة الحساب", "حالة الاشتراك", "الباقة", "حالة الدفع", "بداية الاشتراك",
        "نهاية الاشتراك", "الدروس المكتملة", "إجمالي الدروس", "حالة إكمال الكورس",
        "الهدف التعليمي", "متوسط الكويز", "متوسط الامتحانات",
        "الأداء الإجمالي", "تصنيف الأداء", "تاريخ التسجيل",
    ]
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="24314A")
    for index, width in enumerate((24, 34, 14, 14, 20, 22, 18, 18, 14, 16, 22, 22, 16, 16, 22, 36, 16, 16, 16, 20, 22), start=1):
        sheet.column_dimensions[chr(64 + index)].width = width

    for user in users:
        done, total = lesson_counts.get(user.id, (0, 0))
        profile = profile_by_user.get(user.id)
        values = [
            user.full_name or "",
            user.email or "",
            user.phone_country or "",
            f"+{user.phone_country_code}" if user.phone_country_code else "",
            user.phone_number or "",
            user.phone_e164 or "",
            getattr(user, "status", "active") or "active",
            _effective_subscription_status(user, now),
            user.subscription_plan or "",
            "paid" if user.id in paid_user_ids else "unpaid",
            user.subscription_start.isoformat() if user.subscription_start else "",
            user.subscription_expires.isoformat() if user.subscription_expires else "",
            done,
            total,
            "completed" if total > 0 and done == total else "not_completed",
            profile.goal if profile else "",
            performance_data[user.id]["average_quiz_score"],
            performance_data[user.id]["average_exam_score"],
            performance_data[user.id]["performance_score"],
            performance_data[user.id]["performance_band"],
            user.created_date.isoformat() if user.created_date else "",
        ]
        safe_values = []
        for value in values:
            if isinstance(value, str) and value.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")):
                value = "'" + value
            safe_values.append(value)
        sheet.append(safe_values)

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    filename = f"zeus-users-{datetime.utcnow():%Y%m%d-%H%M%S}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/users/export-completed.xlsx")
def admin_export_completed_users(
    account_type: str = "all",
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    if account_type not in ADMIN_ACCOUNT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid account_type filter")
    users = session.exec(select(User).where(User.role != "admin").order_by(User.created_date.desc())).all()
    users = [user for user in users if _matches_admin_account_type(user, account_type)]
    roadmaps = session.exec(select(Roadmap).order_by(Roadmap.created_date)).all()
    lessons = session.exec(select(Lesson)).all()
    tracks_by_user = {}
    for roadmap in roadmaps:
        tracks_by_user.setdefault(roadmap.user_id, []).append(roadmap)
    lessons_by_roadmap = {}
    for lesson in lessons:
        lessons_by_roadmap.setdefault((lesson.user_id, lesson.roadmap_id), []).append(lesson)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Completed Users"
    sheet.append(["Full name", "Phone number", "Email", "Track"])
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="24314A")
    for column, width in zip(("A", "B", "C", "D"), (28, 22, 36, 40)):
        sheet.column_dimensions[column].width = width

    for user in users:
        base_track = None
        for track in tracks_by_user.get(user.id, []):
            track_lessons = lessons_by_roadmap.get((user.id, track.id), [])
            capstones = [
                lesson for lesson in track_lessons
                if lesson.node_id == "stage_project_final"
                or (lesson.task or {}).get("is_capstone_project")
            ]
            has_approved_capstone = any(
                (lesson.task or {}).get("review", {}).get("approved") is True
                and ((lesson.task or {}).get("submission_text") or (lesson.task or {}).get("submission_url"))
                for lesson in capstones
            )
            has_capstone = bool(capstones)
            if track.status in {"completed", "finished"} and track_lessons and has_capstone and has_approved_capstone and all(
                lesson.status == "completed" or lesson.quiz_passed
                for lesson in track_lessons
            ):
                base_track = track
                break
        if not base_track:
            continue
        values = [user.full_name or "", user.phone_e164 or user.phone_number or "", user.email or "", base_track.goal or ""]
        sheet.append([
            "'" + value if isinstance(value, str) and value.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")) else value
            for value in values
        ])

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    filename = f"zeus-completed-users-{datetime.utcnow():%Y%m%d-%H%M%S}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


def _admin_quiz_answer(lesson: Lesson, attempt: dict, feedback: dict, *, student: bool):
    question_index = feedback.get("index")
    try:
        question_index = int(question_index)
    except (TypeError, ValueError):
        question_index = -1
    answers = attempt.get("answers") if isinstance(attempt.get("answers"), dict) else {}
    raw_answer = answers.get(str(question_index), answers.get(question_index))
    question = lesson.quiz[question_index] if isinstance(lesson.quiz, list) and 0 <= question_index < len(lesson.quiz) else {}
    if student:
        if isinstance(question.get("options"), list):
            try:
                answer_index = int(raw_answer)
            except (TypeError, ValueError):
                return str(raw_answer or "No answer")
            options = question["options"]
            return options[answer_index] if 0 <= answer_index < len(options) else "No answer"
        return str(raw_answer or "No answer")
    if feedback.get("correct_answer"):
        return feedback["correct_answer"]
    if isinstance(question.get("options"), list):
        correct_index = question.get("correct")
        return question["options"][correct_index] if isinstance(correct_index, int) and 0 <= correct_index < len(question["options"]) else ""
    return str(question.get("expected_answer") or "")


@router.get("/users/{user_id}/learning")
def admin_user_learning(
    user_id: str,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    roadmaps = session.exec(
        select(Roadmap).where(Roadmap.user_id == user_id).order_by(Roadmap.created_date.desc())
    ).all()
    lessons = session.exec(
        select(Lesson).where(Lesson.user_id == user_id).order_by(Lesson.order)
    ).all()
    progress_rows = session.exec(
        select(LessonProgress).where(LessonProgress.user_id == user_id)
    ).all()
    conversations = session.exec(
        select(Conversation).where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_date.desc()).limit(100)
    ).all()
    profiles = session.exec(
        select(LearningProfile).where(LearningProfile.user_id == user_id).order_by(LearningProfile.created_date.desc())
    ).all()
    cv = session.exec(
        select(CV).where(CV.user_id == user_id).order_by(CV.created_date.desc())
    ).first()
    projects = session.exec(
        select(Project).where(Project.user_id == user_id).order_by(Project.created_date.desc())
    ).all()
    certificates = session.exec(
        select(Certificate).where(Certificate.user_id == user_id).order_by(Certificate.created_date.desc())
    ).all()
    partner_membership = session.exec(
        select(PartnerMember).where(
            PartnerMember.user_id == user_id,
            PartnerMember.member_type == "student",
        )
    ).first()
    exam_results = []
    if partner_membership:
        assessments = session.exec(
            select(PartnerAssessment).where(PartnerAssessment.partner_id == partner_membership.partner_id)
        ).all()
        assessments = [
            item for item in assessments
            if item.doctor_id is None or item.doctor_id == partner_membership.doctor_id
        ]
        assessment_ids = [item.id for item in assessments]
        attempts_by_assessment = {}
        if assessment_ids:
            for attempt in session.exec(
                select(PartnerAssessmentAttempt)
                .where(
                    PartnerAssessmentAttempt.user_id == user_id,
                    PartnerAssessmentAttempt.assessment_id.in_(assessment_ids),
                )
                .order_by(PartnerAssessmentAttempt.submitted_date.desc())
            ).all():
                attempts_by_assessment.setdefault(attempt.assessment_id, []).append(attempt)
        exam_results = [
            {
                "assessment_id": assessment.id,
                "title": assessment.title,
                "kind": assessment.kind,
                "attempts": [
                    {
                        "score": attempt.score,
                        "total_points": attempt.total_points,
                        "percentage": round(attempt.score / attempt.total_points * 100) if attempt.total_points else 0,
                        "submitted_date": attempt.submitted_date.isoformat(),
                    }
                    for attempt in attempts_by_assessment.get(assessment.id, [])
                ],
            }
            for assessment in assessments
        ]
    notifications = session.exec(
        select(Notification).where(Notification.user_id == user_id).order_by(Notification.created_date.desc()).limit(100)
    ).all()
    all_communities = session.exec(select(Community).order_by(Community.name)).all()
    memberships = [community for community in all_communities if user_id in (community.members or [])]
    community_ids = [community.id for community in memberships]
    community_messages = session.exec(
        select(CommunityMessage).where(CommunityMessage.community_id.in_(community_ids))
        .order_by(CommunityMessage.created_date.desc()).limit(200)
    ).all() if community_ids else []
    support_chats = session.exec(
        select(SupportChat).where(SupportChat.user_id == user_id)
        .order_by(SupportChat.updated_date.desc()).limit(50)
    ).all()
    support_requests = session.exec(
        select(SupportRequest)
        .where(func.lower(SupportRequest.email) == user.email.lower())
        .order_by(SupportRequest.created_date.desc())
        .limit(100)
    ).all()
    subscription_history = session.exec(
        select(SubscriptionRequest)
        .where(
            (SubscriptionRequest.user_id == user_id)
            | (func.lower(SubscriptionRequest.email) == user.email.lower())
        )
        .order_by(SubscriptionRequest.created_date.desc())
        .limit(100)
    ).all()
    support_messages = session.exec(
        select(SupportChatMessage)
        .where(SupportChatMessage.chat_id.in_([chat.id for chat in support_chats]))
        .order_by(SupportChatMessage.created_date.desc()).limit(500)
    ).all() if support_chats else []
    support_messages_by_chat = {}
    for message in reversed(support_messages):
        support_messages_by_chat.setdefault(message.chat_id, []).append(message)
    progress_by_lesson = {row.lesson_id: row for row in progress_rows}
    lesson_by_id = {lesson.id: lesson for lesson in lessons}
    lesson_items = []
    weak_topics = {}
    topic_scores = {}
    for lesson in lessons:
        progress = progress_by_lesson.get(lesson.id)
        history = progress.quiz_answers.get("history", []) if progress and isinstance(progress.quiz_answers, dict) else []
        for attempt in history if isinstance(history, list) else []:
            for answer in attempt.get("feedback", []) if isinstance(attempt, dict) and isinstance(attempt.get("feedback"), list) else []:
                if not isinstance(answer, dict) or not isinstance(answer.get("correct"), bool):
                    continue
                topic = str(answer.get("topic") or lesson.node_title or "").strip()
                if not topic:
                    continue
                score = topic_scores.setdefault(topic, {"topic": topic, "correct": 0, "incorrect": 0, "questions": 0, "lesson_title": lesson.node_title})
                score["questions"] += 1
                if answer["correct"]:
                    score["correct"] += 1
                else:
                    score["incorrect"] += 1
                    item = weak_topics.setdefault(topic, {"topic": topic, "incorrect_answers": 0, "lesson_title": lesson.node_title})
                    item["incorrect_answers"] += 1
        lesson_items.append({
            "id": lesson.id,
            "roadmap_id": lesson.roadmap_id,
            "node_id": lesson.node_id,
            "title": lesson.node_title,
            "phase": lesson.phase,
            "day": lesson.day,
            "week": lesson.week,
            "order": lesson.order,
            "status": lesson.status,
            "quiz_passed": lesson.quiz_passed,
            "quiz_score": lesson.quiz_score,
            "video_title": lesson.video_title,
            "video_verified": lesson.video_verified,
            "video_duration": lesson.video_duration,
            "video_watched": progress.video_watched if progress else False,
            "video_position_sec": progress.video_position_sec if progress else 0,
            "video_watched_sec": progress.video_watched_sec if progress else 0,
            "summary": lesson.summary,
            "reading_content": lesson.reading_content,
            "video_url": lesson.video_url,
            "content_ready": lesson.content_ready,
            "resources": lesson.resources or [],
            "task_details": lesson.task or {},
            "project": bool((lesson.task or {}).get("is_stage_project")),
            "capstone": bool((lesson.task or {}).get("is_capstone_project")),
            "project_submission": {
                "text": (lesson.task or {}).get("submission_text"),
                "url": (lesson.task or {}).get("submission_url"),
                "approved": ((lesson.task or {}).get("review") or {}).get("approved"),
                "score": ((lesson.task or {}).get("review") or {}).get("score"),
                "feedback": ((lesson.task or {}).get("review") or {}).get("feedback"),
            } if (lesson.task or {}).get("submission_text") or (lesson.task or {}).get("submission_url") else None,
            "attempts": progress.attempts if progress else 0,
            "quiz_history": [
                {
                    "score": attempt.get("score"),
                    "passed": attempt.get("passed"),
                    "submitted_at": attempt.get("submitted_at"),
                    "feedback": [
                        {
                            "question": item.get("question"),
                            "topic": item.get("topic") or lesson.node_title,
                            "correct": item.get("correct"),
                            "student_answer": _admin_quiz_answer(lesson, attempt, item, student=True),
                            "correct_answer": item.get("correct_answer") or _admin_quiz_answer(lesson, attempt, item, student=False),
                            "feedback": item.get("feedback") or item.get("explanation"),
                        }
                        for item in attempt.get("feedback", [])
                        if isinstance(item, dict)
                    ],
                }
                for attempt in history[-10:]
                if isinstance(attempt, dict)
            ] if isinstance(history, list) else [],
        })
    return {
        "user_id": user_id,
        "user": {
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone_e164 or user.phone_number,
            "phone_country": user.phone_country,
            "subscription_plan": user.subscription_plan,
            "subscription_status": user.subscription_status,
            "status": user.status,
            "role": user.role,
            "avatar_url": user.avatar_url,
            "portfolio_url": f"/portfolio/{user.id}",
            "cv_url": f"/portfolio/{user.id}" if cv else None,
        },
        "profile": {
            key: value
            for key, value in profiles[0].model_dump().items()
            if key not in {"id", "user_id", "created_date", "updated_date"}
        } if profiles else None,
        "cv": {
            **cv.model_dump(),
        } if cv else None,
        "tracks": [
            {
                "id": roadmap.id,
                "goal": roadmap.goal,
                "status": roadmap.status,
                "version": roadmap.version,
                "created_date": roadmap.created_date.isoformat() if roadmap.created_date else None,
                "lessons_total": len([lesson for lesson in lessons if lesson.roadmap_id == roadmap.id]),
                "lessons_completed": sum(
                    lesson.roadmap_id == roadmap.id and (lesson.status == "completed" or lesson.quiz_passed)
                    for lesson in lessons
                ),
                "capstone_exists": any(
                    lesson.roadmap_id == roadmap.id
                    and (lesson.node_id == "stage_project_final" or (lesson.task or {}).get("is_capstone_project"))
                    for lesson in lessons
                ),
                "capstone_completed": any(
                    lesson.roadmap_id == roadmap.id
                    and (lesson.node_id == "stage_project_final" or (lesson.task or {}).get("is_capstone_project"))
                    and (lesson.task or {}).get("review", {}).get("approved") is True
                    and ((lesson.task or {}).get("submission_text") or (lesson.task or {}).get("submission_url"))
                    for lesson in lessons
                ),
            }
            for roadmap in roadmaps
        ],
        "lessons": lesson_items,
        "skill_graph": profiles[0].skill_graph if profiles else [],
        "target_skills": profiles[0].target_skills if profiles else [],
        "skills_in_progress": list(dict.fromkeys(
            skill
            for track in roadmaps if track.status == "active"
            for node in (track.nodes or [])
            if isinstance(node, dict)
            for skill in (node.get("skills") or [])
            if isinstance(skill, str) and skill.strip()
            and not any(
                isinstance(item, dict) and str(item.get("skill", "")).casefold() == skill.casefold()
                and (item.get("level") or 0) >= 70
                for item in (profiles[0].skill_graph or [] if profiles else [])
            )
        )),
        "strength_topics": [
            item for item in topic_scores.values()
            if item["questions"] >= 2 and item["correct"] / item["questions"] >= 0.8
        ][:12],
        "weak_topics": sorted(
            (item for item in weak_topics.values() if item["incorrect_answers"] >= 2),
            key=lambda item: (-item["incorrect_answers"], item["topic"].casefold()),
        )[:12],
        "tutor_chats": [
            {
                "type": conversation.type,
                "lesson_id": conversation.lesson_id,
                "lesson_title": lesson_by_id[conversation.lesson_id].node_title if conversation.lesson_id in lesson_by_id else None,
                "updated_date": conversation.updated_date.isoformat() if conversation.updated_date else None,
                "messages": [
                    {
                        "role": message.get("role"),
                        "content": str(message.get("content") or "")[:700],
                        "ts": message.get("ts") or message.get("created_date"),
                    }
                    for message in (conversation.messages or [])[-20:]
                    if isinstance(message, dict) and message.get("mode") != "analysis" and message.get("role") in {"user", "assistant"}
                ] if isinstance(conversation.messages, list) else [],
            }
            for conversation in conversations
            if conversation.type in {"lesson", "learning_review"}
        ],
        "conversations": [
            {
                "type": conversation.type,
                "updated_date": conversation.updated_date.isoformat() if conversation.updated_date else None,
                "messages": [
                    {
                        "role": message.get("role"),
                        "content": str(message.get("content") or "")[:1000],
                        "ts": message.get("ts") or message.get("created_date"),
                    }
                    for message in (conversation.messages or [])[-20:]
                    if isinstance(message, dict) and message.get("role") in {"user", "assistant"}
                ] if isinstance(conversation.messages, list) else [],
            }
            for conversation in conversations
            if conversation.type not in {"lesson", "learning_review"}
        ],
        "projects": [project.model_dump() for project in projects],
        "certificates": [
            {
                "id": certificate.id,
                "title": certificate.title,
                "file_name": certificate.file_name,
                "media_type": certificate.media_type,
                "share_token": certificate.share_token,
                "created_date": certificate.created_date.isoformat() if certificate.created_date else None,
            }
            for certificate in certificates
        ],
        "subscription_history": [
            {
                "id": item.id,
                "plan": item.plan,
                "amount": item.amount,
                "status": item.status,
                "start_date": item.start_date.isoformat() if item.start_date else None,
                "expires_at": item.expires_at.isoformat() if item.expires_at else None,
                "created_date": item.created_date.isoformat() if item.created_date else None,
                "payment_image_url": item.payment_image_url,
            }
            for item in subscription_history
        ],
        "exam_results": exam_results,
        "notifications": [notification.model_dump() for notification in notifications],
        "communities": [
            {
                "id": community.id,
                "name": community.name,
                "goal": community.goal,
                "stage": community.stage,
                "is_closed": community.is_closed,
                "member_count": community.member_count,
            }
            for community in memberships
        ],
        "community_messages": [
            {
                "community_id": message.community_id,
                "community_name": next((community.name for community in memberships if community.id == message.community_id), None),
                "user_name": message.user_name,
                "is_student_message": message.user_id == user_id,
                "text": message.text,
                "attachments": message.attachments or [],
                "created_date": message.created_date.isoformat() if message.created_date else None,
            }
            for message in community_messages
            if message.community_id in community_ids
        ],
        "support_chats": [
            {
                "id": chat.id,
                "status": chat.status,
                "updated_date": chat.updated_date.isoformat() if chat.updated_date else None,
                "messages": [
                    {
                        "sender_type": message.sender_type,
                        "text": message.text,
                        "attachments": message.attachments or [],
                        "created_date": message.created_date.isoformat() if message.created_date else None,
                    }
                    for message in support_messages_by_chat.get(chat.id, [])[-100:]
                ],
            }
            for chat in support_chats
        ],
        "support_requests": [
            {
                "id": request.id,
                "problem": request.problem,
                "attachments": request.attachments or [],
                "status": request.status,
                "created_date": request.created_date.isoformat() if request.created_date else None,
                "updated_date": request.updated_date.isoformat() if request.updated_date else None,
            }
            for request in support_requests
        ],
    }


@router.put("/users/{user_id}")
def admin_update_user(
    user_id: str, data: dict = Body(...),
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    now = datetime.utcnow()
    if "role" in data:
        if data["role"] not in ("admin", "user"):
            raise HTTPException(status_code=400, detail="Invalid role")
        if u.id == admin.id and data["role"] != "admin":
            raise HTTPException(status_code=400, detail="You cannot demote yourself")
        u.role = data["role"]
    if "email" in data:
        email = str(data["email"] or "").strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254:
            raise HTTPException(status_code=400, detail="Invalid email address")
        existing = session.exec(select(User).where(User.email == email, User.id != u.id)).first()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")
        old_email = u.email
        u.email = email
        linked_requests = session.exec(
            select(SubscriptionRequest).where(
                (SubscriptionRequest.user_id == u.id)
                | (
                    (SubscriptionRequest.user_id.is_(None))
                    & (func.lower(SubscriptionRequest.email) == old_email.lower())
                )
            )
        ).all()
        for request in linked_requests:
            request.user_id = u.id
            request.email = email
            request.updated_date = now
            session.add(request)
        linked_chats = session.exec(select(SupportChat).where(SupportChat.user_id == u.id)).all()
        for chat in linked_chats:
            chat.email = email
            chat.updated_date = now
            session.add(chat)
    if "status" in data:
        if data["status"] not in ("active", "pending", "suspended"):
            raise HTTPException(status_code=400, detail="Invalid status")
        if u.id == admin.id and data["status"] != "active":
            raise HTTPException(status_code=400, detail="You cannot deactivate yourself")
        if data["status"] == "active":
            # Activation requires an active subscription plan first.
            has_plan = bool(getattr(u, "subscription_plan", None)) and getattr(u, "subscription_status", "none") == "active"
            wants_plan = isinstance(data.get("subscription_plan"), str) and data.get("subscription_plan") in ("STARTER", "PRO", "PRIME")
            has_unexpired_plan = not u.subscription_expires or u.subscription_expires > now
            if (not has_plan or not has_unexpired_plan) and not wants_plan:
                raise HTTPException(status_code=400, detail="Cannot activate account without assigning a subscription plan (STARTER/PRO/PRIME) first")
        u.status = data["status"]
    if "subscription_plan" in data:
        plan = data["subscription_plan"]
        if plan in ("STARTER", "PRO", "PRIME"):
            u.subscription_plan = plan
            u.subscription_status = "active"
            u.subscription_start = now
            u.subscription_expires = now + timedelta(days=30)
            if "status" not in data:
                u.status = "active"
        elif plan in ("FREE", "NONE", None, ""):
            if data.get("status") == "active":
                raise HTTPException(status_code=400, detail="Cannot activate an account without an active subscription plan")
            u.subscription_plan = None
            u.subscription_status = "none"
            u.subscription_start = None
            u.subscription_expires = None
            if u.status == "active":
                u.status = "suspended"
        else:
            raise HTTPException(status_code=400, detail="Invalid subscription plan")
    date_fields = {"subscription_start", "subscription_expires"} & data.keys()
    if date_fields:
        if u.subscription_plan not in ("STARTER", "PRO", "PRIME"):
            raise HTTPException(status_code=400, detail="Assign a subscription plan before changing its dates")
        start = (
            _parse_subscription_datetime(data["subscription_start"], "subscription_start")
            if "subscription_start" in data else u.subscription_start or now
        )
        expires = (
            _parse_subscription_datetime(data["subscription_expires"], "subscription_expires")
            if "subscription_expires" in data else u.subscription_expires
        )
        if expires is None or expires <= start:
            raise HTTPException(status_code=400, detail="Subscription expiry must be after its start date")
        u.subscription_start = start
        u.subscription_expires = expires
        u.subscription_status = "active" if expires > now else "expired"
    if data.get("password"):
        if not isinstance(data["password"], str) or len(data["password"]) < 8 or len(data["password"]) > 72:
            raise HTTPException(status_code=400, detail="Password must be 8-72 characters")
        u.password_hash = hash_password(data["password"])
    if "full_name" in data:
        u.full_name = data["full_name"] or None
    u.updated_date = now
    session.add(u)

    if "subscription_plan" in data or date_fields:
        approved_request = session.exec(
            select(SubscriptionRequest)
            .where(
                SubscriptionRequest.status == "approved",
                (SubscriptionRequest.user_id == u.id) | (SubscriptionRequest.email == u.email),
            )
            .order_by(SubscriptionRequest.updated_date.desc())
            .limit(1)
        ).first()
        if approved_request:
            if u.subscription_plan in ("STARTER", "PRO", "PRIME"):
                approved_request.plan = u.subscription_plan
                approved_request.start_date = u.subscription_start
                approved_request.expires_at = u.subscription_expires
            approved_request.updated_date = now
            session.add(approved_request)
    session.commit()
    session.refresh(u)
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "status": getattr(u, "status", "active"),
        "subscription_plan": u.subscription_plan,
        "subscription_status": u.subscription_status,
        "subscription_expires": u.subscription_expires.isoformat() if u.subscription_expires else None,
    }


@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: str, session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    removed = 0
    certificates = session.exec(select(Certificate).where(Certificate.user_id == user_id)).all()
    support_chats = session.exec(select(SupportChat).where(SupportChat.user_id == user_id)).all()
    support_messages = []
    for chat in support_chats:
        messages = session.exec(
            select(SupportChatMessage).where(SupportChatMessage.chat_id == chat.id)
        ).all()
        support_messages.extend(messages)
        for message in messages:
            session.delete(message)
            removed += 1
        session.delete(chat)
        removed += 1
    for Model in OWNED_TABLES:
        rows = session.exec(select(Model).where(Model.user_id == user_id)).all()
        for r in rows:
            session.delete(r)
            removed += 1
    # Remove from community member lists
    for c in session.exec(select(Community)).all():
        members = list(c.members or [])
        if user_id in members:
            members.remove(user_id)
            c.members = list(members)
            c.member_count = len(members)
            session.add(c)
    session.delete(u)
    session.commit()
    _delete_chat_attachments(support_messages)
    from .certificates import _remove_certificate_file
    for certificate in certificates:
        try:
            _remove_certificate_file(certificate)
        except OSError:
            logger.exception("Unable to remove certificate file after deleting user %s", user_id)
    return {"deleted": True, "rows_removed": removed}


@router.get("/communities")
def admin_communities(session: Session = Depends(get_session), admin: User = Depends(require_admin)):
    comms = session.exec(select(Community).order_by(Community.created_date.desc())).all()
    users = session.exec(select(User)).all()
    prof_by_user = {}
    for u in users:
        p = session.exec(
            select(LearningProfile).where(LearningProfile.user_id == u.id).order_by(LearningProfile.created_date.desc())
        ).first()
        if p:
            prof_by_user[u.id] = p
    out = []
    for c in comms:
        msg_count = session.exec(select(func.count(CommunityMessage.id)).where(CommunityMessage.community_id == c.id)).one()
        members = c.members or []
        member_users = [{"id": u.id, "email": u.email, "full_name": u.full_name} for u in users if u.id in members]
        # Suggested members: users whose DNA matches this community and aren't in it
        sugg = []
        for u in users:
            if u.id in members or getattr(u, "role", "user") == "admin":
                continue
            s = _suggest_community(prof_by_user.get(u.id), [c])
            if s:
                sugg.append({"id": u.id, "email": u.email, "full_name": u.full_name,
                             "goal": (prof_by_user.get(u.id).goal if prof_by_user.get(u.id) else None),
                             "reason": s["reason"]})
        out.append({**c.model_dump(), "messages": msg_count, "member_users": member_users, "suggested_members": sugg[:10]})
    return out


@router.post("/communities")
def admin_create_community(
    data: dict = Body(...), session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    import uuid
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    c = Community(
        id=str(uuid.uuid4()), name=name, goal=data.get("goal"),
        stage=data.get("stage"), members=[], member_count=0,
        created_date=datetime.utcnow(), updated_date=datetime.utcnow(),
    )
    # Community has no description/language columns — store extras nowhere; ignore silently
    session.add(c)
    session.commit()
    session.refresh(c)
    return c.model_dump()


@router.put("/communities/{community_id}")
def admin_update_community(
    community_id: str, data: dict = Body(...),
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    c = session.get(Community, community_id)
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    if "is_closed" in data and not isinstance(data["is_closed"], bool):
        raise HTTPException(status_code=400, detail="is_closed must be a boolean")
    for k in ("name", "goal", "stage", "is_closed"):
        if k in data and data[k] is not None:
            setattr(c, k, data[k])
    c.updated_date = datetime.utcnow()
    session.add(c)
    session.commit()
    session.refresh(c)
    return c.model_dump()


@router.delete("/communities/{community_id}")
def admin_delete_community(
    community_id: str, session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    c = session.get(Community, community_id)
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    msgs = session.exec(select(CommunityMessage).where(CommunityMessage.community_id == community_id)).all()
    for m in msgs:
        session.delete(m)
    session.delete(c)
    session.commit()
    return {"deleted": True, "messages_removed": len(msgs)}


@router.get("/messages")
def admin_messages(
    limit: int = Query(default=50, le=200),
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    msgs = session.exec(select(CommunityMessage).order_by(CommunityMessage.created_date.desc()).limit(limit)).all()
    out = []
    for m in msgs:
        c = session.get(Community, m.community_id)
        u = session.get(User, m.user_id) if m.user_id else None
        out.append({
            "id": m.id, "text": m.text, "community_id": m.community_id,
            "community_name": c.name if c else "?",
            "user_email": u.email if u else (m.user_name or m.user_id),
            "created_date": m.created_date.isoformat() if m.created_date else None,
        })
    return out


@router.get("/communities/{community_id}/messages")
def admin_community_messages(
    community_id: str,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    community = session.get(Community, community_id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    messages = session.exec(
        select(CommunityMessage)
        .where(CommunityMessage.community_id == community_id)
        .order_by(CommunityMessage.created_date, CommunityMessage.id)
    ).all()
    author_ids = {message.user_id for message in messages if message.user_id}
    users = {
        user.id: user
        for user in session.exec(select(User).where(User.id.in_(author_ids))).all()
    } if author_ids else {}
    return [
        {
            **message.model_dump(),
            "user_email": (users[message.user_id].email if message.user_id in users else None)
            or message.user_name
            or message.user_id
            or "unknown",
            "author_name": (
                (users[message.user_id].full_name if message.user_id in users else None)
                or message.user_name
                or (users[message.user_id].email if message.user_id in users else None)
                or message.user_id
                or "unknown"
            ),
            "is_admin": bool(message.user_id in users and users[message.user_id].role == "admin"),
        }
        for message in messages
    ]


@router.post("/communities/{community_id}/messages")
def admin_send_community_message(
    community_id: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    import uuid

    community = session.get(Community, community_id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    message_text = (data.get("text") or "").strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Message text is required")
    message = CommunityMessage(
        id=str(uuid.uuid4()),
        community_id=community_id,
        user_id=admin.id,
        user_name=admin.email,
        text=message_text,
        created_date=datetime.utcnow(),
        updated_date=datetime.utcnow(),
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    return {
        **message.model_dump(),
        "user_email": admin.email,
        "author_name": admin.full_name or admin.email,
        "is_admin": True,
    }


@router.post("/messages/{message_id}/pin")
def admin_pin_community_message(
    message_id: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    message = session.get(CommunityMessage, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    pinned = data.get("is_pinned")
    if not isinstance(pinned, bool):
        raise HTTPException(status_code=400, detail="is_pinned must be a boolean")
    if pinned:
        other_pinned = session.exec(
            select(CommunityMessage).where(
                CommunityMessage.community_id == message.community_id,
                CommunityMessage.is_pinned.is_(True),
            )
        ).all()
        for other in other_pinned:
            if other.id != message.id:
                other.is_pinned = False
                other.updated_date = datetime.utcnow()
                session.add(other)
    message.is_pinned = pinned
    message.updated_date = datetime.utcnow()
    session.add(message)
    session.commit()
    session.refresh(message)
    return message.model_dump()


@router.delete("/messages/{message_id}")
def admin_delete_message(
    message_id: str, session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    m = session.get(CommunityMessage, message_id)
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    session.delete(m)
    session.commit()
    return {"deleted": True}


@router.post("/communities/{community_id}/members")
def admin_add_member(
    community_id: str, data: dict = Body(...),
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    """Assign a user to a community + notify them (shows up in their list)."""
    import uuid
    target = data.get("user_id")
    if not target:
        raise HTTPException(status_code=400, detail="user_id required")
    c = session.get(Community, community_id)
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    target_user = session.get(User, target)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    members = list(c.members or [])
    if target not in members:
        members.append(target)
    c.members = list(members)
    c.member_count = len(members)
    c.updated_date = datetime.utcnow()
    session.add(c)
    session.add(Notification(
        id=str(uuid.uuid4()), user_id=target, type="community",
        title="انضممت لمجتمع جديد! 🎉",
        body=f"أضافك الأدمن لمجتمع '{c.name}'. ادخل على صفحة المجتمع وابدأ الشات.",
        action_label="افتح المجتمع", action_url="/community",
        created_date=datetime.utcnow(), updated_date=datetime.utcnow(),
    ))
    session.commit()
    session.refresh(c)
    return c.model_dump()


@router.delete("/communities/{community_id}/members/{user_id}")
def admin_remove_member(
    community_id: str, user_id: str,
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    c = session.get(Community, community_id)
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    members = [m for m in (c.members or []) if m != user_id]
    c.members = members
    c.member_count = len(members)
    c.updated_date = datetime.utcnow()
    session.add(c)
    session.commit()
    session.refresh(c)
    return c.model_dump()


@router.post("/communities/{community_id}/ban")
def admin_ban_member(
    community_id: str, data: dict = Body(...),
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    target = data.get("user_id")
    if not target:
        raise HTTPException(status_code=400, detail="user_id required")
    c = session.get(Community, community_id)
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    members = [m for m in (c.members or []) if m != target]
    c.members = members
    c.member_count = len(members)
    c.updated_date = datetime.utcnow()
    session.add(c)
    session.commit()
    return c.model_dump()


@router.post("/broadcast")
def admin_broadcast(
    data: dict = Body(...), session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    import uuid
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    if not title or not body:
        raise HTTPException(status_code=400, detail="Title and body are required")
    # Targeted mode: resolve one user by email (or name fragment) instead of all
    target = (data.get("user_email") or "").strip().lower()
    users = session.exec(select(User)).all()
    if target:
        match = next((u for u in users if (u.email or "").lower() == target), None)
        if not match:
            exact_name_matches = [u for u in users if target == (u.full_name or "").strip().lower()]
            if len(exact_name_matches) == 1:
                match = exact_name_matches[0]
            elif len(exact_name_matches) > 1:
                raise HTTPException(status_code=409, detail="Multiple users match that name; use an email address")
        if not match:
            partial_matches = [
                u for u in users
                if target in (u.email or "").lower() or target in (u.full_name or "").lower()
            ]
            if len(partial_matches) == 1:
                match = partial_matches[0]
            elif len(partial_matches) > 1:
                raise HTTPException(status_code=409, detail="Multiple users match; enter a full name or email address")
        if match is None:
            raise HTTPException(status_code=404, detail="No user matches that email or name")
        users = [match]
    n = 0
    for u in users:
        session.add(Notification(
            id=str(uuid.uuid4()), user_id=u.id, type="announcement",
            title=title, body=body,
            action_label=data.get("action_label"), action_url=data.get("action_url"),
            created_date=datetime.utcnow(), updated_date=datetime.utcnow(),
        ))
        n += 1
    session.commit()
    return {"sent": n, "targeted": bool(target)}


# ---------------- Subscribers & Subscription Requests ----------------

@router.get("/subscribers")
def admin_subscribers(
    status: str = Query(default=""),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    stmt = select(SubscriptionRequest).order_by(SubscriptionRequest.created_date.desc())
    if status:
        stmt = stmt.where(SubscriptionRequest.status == status)
    reqs = session.exec(stmt).all()
    now = datetime.utcnow()
    out = []
    for r in reqs:
        # Check active status and remaining days
        remaining_days = None
        is_expired = False
        if r.expires_at:
            delta = (r.expires_at - now).total_seconds()
            remaining_days = max(0, int(delta // 86400))
            is_expired = delta <= 0

        # Check corresponding user account
        target_user = None
        if r.user_id:
            target_user = session.get(User, r.user_id)
        if not target_user and r.email:
            target_user = session.exec(select(User).where(User.email == r.email.lower())).first()
        is_current = bool(
            target_user
            and target_user.status == "active"
            and target_user.subscription_status == "active"
            and target_user.subscription_plan == r.plan
            and (not target_user.subscription_start or target_user.subscription_start <= now)
            and (not target_user.subscription_expires or target_user.subscription_expires > now)
        )
        is_scheduled = bool(
            target_user
            and target_user.status == "active"
            and target_user.subscription_status == "active"
            and target_user.subscription_plan == r.plan
            and target_user.subscription_start
            and target_user.subscription_start > now
            and (not target_user.subscription_expires or target_user.subscription_expires > now)
        )
        if target_user and target_user.subscription_expires and target_user.subscription_expires <= now:
            is_expired = True

        out.append({
            "id": r.id,
            "user_id": r.user_id or (target_user.id if target_user else None),
            "user_name": r.full_name or (target_user.full_name if target_user else ""),
            "email": r.email,
            "phone": r.phone,
            "plan": r.plan,
            "amount": r.amount,
            "payment_image_url": r.payment_image_url,
            "notes": r.notes,
            "status": r.status,
            "start_date": r.start_date.isoformat() if r.start_date else None,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "created_date": r.created_date.isoformat() if r.created_date else None,
            "remaining_days": remaining_days,
            "is_expired": is_expired,
            "is_active": is_current,
            "is_scheduled": is_scheduled,
            "starts_in_days": (
                max(0, int((target_user.subscription_start - now).total_seconds() // 86400))
                if is_scheduled else None
            ),
            "user_account_status": target_user.status if target_user else "not_registered",
        })
    return out


@router.post("/subscribers/{request_id}/approve")
def admin_approve_subscriber(
    request_id: str,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    sub = session.get(SubscriptionRequest, request_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription request not found")

    if sub.plan not in ("STARTER", "PRO", "PRIME"):
        raise HTTPException(status_code=400, detail="Cannot approve without a valid plan (STARTER/PRO/PRIME)")

    # Find or link the user account
    target_user = None
    if sub.user_id:
        target_user = session.get(User, sub.user_id)
    if not target_user and sub.email:
        target_user = session.exec(select(User).where(User.email == sub.email.lower())).first()

    now = datetime.utcnow()
    renewal_start = now
    if (
        target_user
        and target_user.subscription_plan == sub.plan
        and target_user.subscription_status == "active"
        and target_user.subscription_expires
        and target_user.subscription_expires > now
    ):
        renewal_start = target_user.subscription_expires
    sub.status = "approved"
    sub.start_date = renewal_start
    sub.expires_at = renewal_start + timedelta(days=30)
    sub.updated_date = now
    session.add(sub)

    if target_user:
        target_user.status = "active"
        target_user.subscription_plan = sub.plan
        target_user.subscription_status = "active"
        target_user.subscription_start = sub.start_date
        target_user.subscription_expires = sub.expires_at
        target_user.updated_date = now
        session.add(target_user)

        import uuid
        plan_ar = {"STARTER": "ستارتر", "PRO": "برو", "PRIME": "برايم"}.get(sub.plan, sub.plan)
        session.add(Notification(
            id=str(uuid.uuid4()),
            user_id=target_user.id,
            type="subscription",
            title=f"تم تفعيل اشتراكك ({sub.plan})! 🎉",
            body=f"تم تأكيد الدفع وتفعيل باقة {plan_ar} بنجاح لمدة 30 يوم حتى {sub.expires_at.strftime('%Y-%m-%d')}.",
            action_label="ابدأ الآن",
            action_url="/app",
            created_date=now,
            updated_date=now,
        ))

    session.commit()
    session.refresh(sub)
    return {
        "success": True,
        "message": f"تمت الموافقة على اشتراك {sub.email} وتفعيل باقة {sub.plan} بنجاح",
        "sub": {
            "id": sub.id,
            "status": sub.status,
            "start_date": sub.start_date.isoformat(),
            "expires_at": sub.expires_at.isoformat(),
        },
    }


@router.post("/users/{user_id}/stop-subscription")
def admin_stop_user_subscription(
    user_id: str,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Administrator subscriptions cannot be stopped")

    now = datetime.utcnow()
    user.status = "suspended"
    user.subscription_status = "expired"
    user.subscription_expires = now
    user.updated_date = now
    session.add(user)

    requests = session.exec(
        select(SubscriptionRequest).where(
            SubscriptionRequest.status == "approved",
            (
                (SubscriptionRequest.user_id == user.id)
                | (func.lower(SubscriptionRequest.email) == user.email.lower())
            ),
        )
    ).all()
    for request in requests:
        request.expires_at = now
        request.updated_date = now
        session.add(request)

    session.commit()
    return {
        "success": True,
        "user_id": user.id,
        "status": user.status,
        "subscription_status": user.subscription_status,
        "subscription_expires": now.isoformat(),
    }


@router.post("/subscribers/{request_id}/reject")
def admin_reject_subscriber(
    request_id: str,
    data: dict = Body(default={}),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    sub = session.get(SubscriptionRequest, request_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription request not found")

    now = datetime.utcnow()
    sub.status = "rejected"
    sub.notes = (sub.notes or "") + (f"\n[سبب الرفض: {data.get('reason')}]" if data.get("reason") else "")
    sub.updated_date = now
    session.add(sub)
    session.commit()
    return {"success": True, "message": "تم رفض طلب الاشتراك"}


# ---------------- Admin Settings: Pricing, AI Models, YouTube API, External Services ----------------

@router.get("/settings/ai-status")
def admin_ai_status(
    admin: User = Depends(require_admin),
):
    from ..services.llm import (
        AI_TASK_DEFAULT_MODELS,
        TASK_ROUTES,
        _configured_ai_routes,
        _get_runtime_settings,
    )

    cfg = _get_runtime_settings()
    providers = {
        "groq": ("groq_api_key", "groq_model"),
        "openai": ("openai_api_key", "openai_model"),
        "gemini": ("gemini_api_key", "gemini_model"),
    }
    config = _configured_ai_routes(cfg)

    def safe_slot(slot):
        key = str(slot.get("api_key") or "")
        provider = slot.get("provider", "groq")
        return {
            "provider": provider,
            "model": slot.get("model", AI_TASK_DEFAULT_MODELS.get(provider, AI_TASK_DEFAULT_MODELS["groq"])),
            "configured": bool(key),
            "key_hint": f"…{key[-4:]}" if len(key) > 4 else ("…" if key else ""),
        }

    safe_tasks = {
        task: [safe_slot(slot) for slot in (config.get("tasks", {}).get(task) or [])[:4]]
        for task in TASK_ROUTES
    }
    task_assignments = {
        task: slots[0] if slots else {
            "provider": "groq",
            "model": cfg.get("groq_model") or AI_TASK_DEFAULT_MODELS["groq"],
        }
        for task, slots in safe_tasks.items()
    }
    reviewer_slots = [safe_slot(slot) for slot in config.get("reviewer", [])[:2]]
    while len(reviewer_slots) < 2:
        reviewer_slots.append({"provider": "groq", "model": AI_TASK_DEFAULT_MODELS["groq"], "configured": False, "key_hint": ""})
    youtube_keys = []
    for slot in (config.get("youtube_keys") or [])[:4]:
        key = slot.get("api_key", "") if isinstance(slot, dict) else str(slot or "")
        youtube_keys.append({
            "configured": bool(key),
            "key_hint": f"…{key[-4:]}" if len(key) > 4 else ("…" if key else ""),
        })
    while len(youtube_keys) < 4:
        youtube_keys.append({"configured": False, "key_hint": ""})
    return {
        "providers": {
            name: {
                "configured": bool(cfg.get(key)),
                "model": cfg.get(model, ""),
            }
            for name, (key, model) in providers.items()
        },
        "career_research": {
            "gemini": bool(cfg.get("gemini_api_key")),
            "openai": bool(cfg.get("openai_api_key")),
        },
        "task_assignments": task_assignments,
        "ai_config": {
            "tasks": safe_tasks,
            "reviewer": reviewer_slots,
            "youtube_keys": youtube_keys,
        },
    }


@router.put("/settings/ai-config")
def admin_update_ai_config(
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    from ..services.llm import AI_TASK_DEFAULT_MODELS, TASK_ROUTES

    setting = session.get(AdminSetting, "default")
    if not setting:
        setting = AdminSetting(id="default")
    current_cfg = {
        "ai_task_routes": setting.ai_task_routes or {},
        "openai_api_key": setting.openai_api_key or "",
        "openai_model": setting.openai_model or AI_TASK_DEFAULT_MODELS["openai"],
        "gemini_api_key": setting.gemini_api_key or "",
        "gemini_model": setting.gemini_model or AI_TASK_DEFAULT_MODELS["gemini"],
        "groq_api_key": setting.groq_api_key or "",
        "groq_model": setting.groq_model or AI_TASK_DEFAULT_MODELS["groq"],
        "youtube_api_key": setting.youtube_api_key or "",
    }
    from ..services.llm import _configured_ai_routes
    previous = _configured_ai_routes(current_cfg)
    tasks = data.get("tasks")
    reviewer = data.get("reviewer")
    youtube_keys = data.get("youtube_keys")
    if not isinstance(tasks, dict) or set(tasks) != set(TASK_ROUTES):
        raise HTTPException(status_code=400, detail="Invalid AI task list")
    if not isinstance(reviewer, list) or len(reviewer) != 2:
        raise HTTPException(status_code=400, detail="Reviewer requires a primary and one backup")
    if not isinstance(youtube_keys, list) or len(youtube_keys) != 4:
        raise HTTPException(status_code=400, detail="YouTube requires four key slots")

    def clean_slot(value, old_slot, allow_empty=False):
        if not isinstance(value, dict):
            raise HTTPException(status_code=400, detail="Invalid provider slot")
        provider = str(value.get("provider", "")).strip().lower()
        model = str(value.get("model", "")).strip()
        key = value.get("api_key", "")
        if provider not in {"openai", "gemini", "groq"} or not model or len(model) > 120:
            raise HTTPException(status_code=400, detail="Invalid provider or model in slot")
        if not isinstance(key, str) or len(key) > 512:
            raise HTTPException(status_code=400, detail="Invalid API key")
        if value.get("clear_key") is True:
            key = ""
        elif not key.strip() or key.strip().startswith("…"):
            key = str(old_slot.get("api_key") or "") if old_slot.get("provider") == provider else ""
        else:
            key = key.strip()
        if not allow_empty and not key:
            return {"provider": provider, "model": model, "api_key": ""}
        return {"provider": provider, "model": model, "api_key": key}

    clean_tasks = {}
    old_tasks = previous.get("tasks", {})
    for task, slots in tasks.items():
        if not isinstance(slots, list) or len(slots) != 4:
            raise HTTPException(status_code=400, detail=f"{task} must have four provider slots")
        clean_tasks[task] = [
            clean_slot(value, (old_tasks.get(task) or [{}] * 4)[index], allow_empty=True)
            for index, value in enumerate(slots)
        ]
    clean_reviewer = [
        clean_slot(value, (previous.get("reviewer") or [{}] * 2)[index], allow_empty=True)
        for index, value in enumerate(reviewer)
    ]
    clean_youtube = []
    old_youtube = previous.get("youtube_keys") or []
    for index, value in enumerate(youtube_keys):
        if not isinstance(value, dict):
            raise HTTPException(status_code=400, detail="Invalid YouTube key slot")
        key = value.get("api_key", "")
        if not isinstance(key, str) or len(key) > 512:
            raise HTTPException(status_code=400, detail="Invalid YouTube API key")
        old_slot = old_youtube[index] if index < len(old_youtube) else {}
        old_key = old_slot.get("api_key", "") if isinstance(old_slot, dict) else str(old_slot or "")
        if value.get("clear_key") is True:
            key = ""
        elif not key.strip() or key.strip().startswith("…"):
            key = old_key
        else:
            key = key.strip()
        clean_youtube.append({"api_key": key})

    setting.ai_task_routes = {
        "version": 2,
        "tasks": clean_tasks,
        "reviewer": clean_reviewer,
        "youtube_keys": clean_youtube,
    }
    setting.updated_date = datetime.utcnow()
    session.add(setting)
    session.commit()
    session.refresh(setting)
    try:
        from ..services.resources import _cache
        _cache.clear()
    except Exception:
        pass
    return {"success": True}


@router.post("/settings/test-provider")
async def admin_test_ai_provider(
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    provider = str(data.get("provider", "")).strip().lower()
    if provider not in {"openai", "gemini", "groq"}:
        raise HTTPException(status_code=400, detail="Unsupported AI provider")
    model = data.get("model")
    if model is not None:
        if not isinstance(model, str) or not model.strip() or len(model.strip()) > 120:
            raise HTTPException(status_code=400, detail="Model must be 1 to 120 characters")
        model = model.strip()

    api_key = data.get("api_key")
    if api_key is not None and (not isinstance(api_key, str) or len(api_key) > 512):
        raise HTTPException(status_code=400, detail="Invalid API key")
    if api_key is None:
        slot_index = data.get("slot_index")
        task = data.get("task")
        reviewer_slot = data.get("reviewer_slot")
        if isinstance(slot_index, int) and not isinstance(slot_index, bool) and 0 <= slot_index < 4 and task:
            setting = session.get(AdminSetting, "default")
            routes = (setting.ai_task_routes or {}) if setting else {}
            api_key = (((routes.get("tasks") or {}).get(task) or [])[slot_index].get("api_key")
                       if slot_index < len((routes.get("tasks") or {}).get(task) or []) else None)
        elif isinstance(reviewer_slot, int) and not isinstance(reviewer_slot, bool) and 0 <= reviewer_slot < 2:
            setting = session.get(AdminSetting, "default")
            routes = (setting.ai_task_routes or {}) if setting else {}
            slots = routes.get("reviewer") or []
            api_key = slots[reviewer_slot].get("api_key") if reviewer_slot < len(slots) else None

    from ..services.llm import test_ai_provider

    try:
        result = await test_ai_provider(provider, model, api_key_override=api_key)
    except Exception as exc:
        print(f"Admin AI provider test failed for {provider} ({type(exc).__name__})")
        result = {"success": False, "code": "connection_failed"}

    language = "ar" if data.get("language") == "ar" else "en"
    provider_title = {"gemini": "Gemini", "groq": "Groq"}.get(provider, "OpenAI")
    messages = {
        "ok": (
            f"اتصال {provider_title} ناجح"
            if language == "ar" else f"{provider_title} connection successful"
        ),
        "missing_key": (
            f"مفتاح {provider_title} غير مضبوط"
            if language == "ar" else f"{provider_title} API key is not configured"
        ),
        "key_or_access_denied": (
            f"تم رفض المفتاح أو لا يملك صلاحية استخدام {provider_title}"
            if language == "ar" else f"The key was rejected or does not have access to {provider_title}"
        ),
        "model_not_found": (
            "اسم الموديل غير موجود أو غير متاح لهذا المفتاح"
            if language == "ar" else "The model name was not found or is unavailable to this key"
        ),
        "model_not_available": (
            "Google تعرض هذا الموديل في قائمتها، لكنها رفضت تشغيله بهذا المفتاح. راجع الموديل البديل المقترح قبل إعادة الاختبار."
            if language == "ar" else "Google lists this model, but rejected it for this key. Review the suggested replacement before retesting."
        ),
        "quota_or_rate_limit": (
            f"تم تجاوز حصة {provider_title} أو حد الطلبات؛ تحقق من حصة حسابك"
            if language == "ar" else f"{provider_title} quota or rate limit reached; check the account quota"
        ),
        "timeout": (
            f"انتهت مهلة الاتصال بـ {provider_title}"
            if language == "ar" else f"The {provider_title} connection timed out"
        ),
        "network_error": (
            f"تعذر الوصول إلى {provider_title}؛ تحقق من اتصال الخادم بالإنترنت"
            if language == "ar" else f"Could not reach {provider_title}; check the server's internet connection"
        ),
        "empty_response": (
            f"تم الاتصال بـ {provider_title} لكن لم تصل إجابة نصية"
            if language == "ar" else f"Connected to {provider_title}, but no text response was returned"
        ),
        "provider_error": (
            f"رفض {provider_title} الطلب؛ تحقق من إعدادات المفتاح والموديل"
            if language == "ar" else f"{provider_title} rejected the request; check the key and model settings"
        ),
        "connection_failed": (
            f"فشل الاتصال بـ {provider_title}؛ تحقق من المفتاح والموديل والحصة"
            if language == "ar" else f"Connection to {provider_title} failed; check the key, model, and provider quota"
        ),
    }
    code = result.get("code", "connection_failed")
    message = messages.get(code, messages["connection_failed"])
    available_models = result.get("available_models", [])
    suggested_model = result.get("suggested_model")
    if code == "model_not_available" and not available_models:
        message = (
            "Google لم تعرض موديلات أخرى في القائمة؛ تحقق من الموديل المقترح وصلاحية المفتاح."
            if language == "ar" else
            "Google did not list other models; check the suggested model and key access."
        )
    return {
        "success": result.get("success", False),
        "provider": provider,
        "code": code,
        "message": message,
        "available_models": available_models,
        "suggested_model": suggested_model,
    }


@router.get("/settings")
@router.get("/settings/")
def admin_get_settings(
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    setting = session.get(AdminSetting, "default")
    if not setting:
        import os
        from ..core.config import settings as cfg
        setting = AdminSetting(
            id="default",
            starter_price=99.0,
            pro_price=199.0,
            prime_price=399.0,
            currency="EGP",
            groq_api_key=os.getenv("GROQ_API_KEY", "") or cfg.groq_api_key,
            groq_model=os.getenv("GROQ_MODEL", "") or cfg.groq_model,
            gemini_api_key=os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "") or cfg.gemini_api_key,
            gemini_model=os.getenv("GEMINI_MODEL", "") or cfg.gemini_model,
            openai_api_key=os.getenv("OPENAI_API_KEY", "") or cfg.openai_api_key,
            openai_model="gpt-4o-mini",
            youtube_api_key=os.getenv("YOUTUBE_API_KEY", "") or cfg.youtube_api_key,
            active_ai_provider="auto",
        )
        session.add(setting)
        session.commit()
        session.refresh(setting)

    res = setting.model_dump()
    # Remove unused keys from output
    res.pop("search_api_key", None)
    res.pop("job_search_api_key", None)
    # AI routing config contains credentials and is served only through the
    # dedicated masked AI status endpoint.
    res.pop("ai_task_routes", None)
    # Never return full secret values — mask to last 4 chars.
    for k in ("groq_api_key", "gemini_api_key", "openai_api_key", "youtube_api_key"):
        v = res.get(k) or ""
        res[k] = ("…" + v[-4:]) if len(v) > 4 else ("…" if v else "")
    return res


@router.put("/settings")
@router.put("/settings/")
@router.post("/settings")
@router.post("/settings/")
def admin_update_settings(
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    setting = session.get(AdminSetting, "default")
    if not setting:
        setting = AdminSetting(id="default")

    allowed_fields = [
        "starter_price", "pro_price", "prime_price", "currency",
        "subscription_contact_email",
        "starter_description", "starter_features", "pro_description", "pro_features",
        "prime_description", "prime_features",
        "groq_api_key", "groq_model", "gemini_api_key", "gemini_model", "openai_api_key", "openai_model",
        "ai_task_routes",
        "youtube_api_key", *SOCIAL_FIELDS,
    ]

    secret_fields = {"groq_api_key", "gemini_api_key", "openai_api_key", "youtube_api_key"}
    clear_secrets = data.get("clear_secrets", [])
    if not isinstance(clear_secrets, list) or any(key not in secret_fields for key in clear_secrets):
        raise HTTPException(status_code=400, detail="Invalid secret fields to clear")

    for key in clear_secrets:
        setattr(setting, key, "")

    for k in allowed_fields:
        if k in data and data[k] is not None:
            val = data[k]
            if k == "subscription_contact_email":
                val = str(val).strip().lower()
                if len(val) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", val):
                    raise HTTPException(status_code=400, detail="Enter a valid subscription contact email")
            if k == "currency":
                if not isinstance(val, str) or not re.fullmatch(r"[A-Za-z]{3}", val.strip()):
                    raise HTTPException(status_code=400, detail="Currency must be a three-letter code")
                val = val.strip().upper()
            if k.endswith("_description"):
                if not isinstance(val, dict) or any(
                    not isinstance(val.get(language), str) or not val[language].strip() or len(val[language]) > 500
                    for language in ("ar", "en")
                ):
                    raise HTTPException(status_code=400, detail=f"{k} must contain Arabic and English descriptions")
                val = {language: val[language].strip() for language in ("ar", "en")}
            if k.endswith("_features"):
                if not isinstance(val, list) or not val or len(val) > 12:
                    raise HTTPException(status_code=400, detail=f"{k} must contain 1 to 12 features")
                if any(
                    not isinstance(item, dict)
                    or any(not isinstance(item.get(language), str) or not item[language].strip() or len(item[language]) > 250 for language in ("ar", "en"))
                    for item in val
                ):
                    raise HTTPException(status_code=400, detail=f"{k} features must contain Arabic and English text")
                val = [{language: item[language].strip() for language in ("ar", "en")} for item in val]
            if k in SOCIAL_FIELDS:
                val = _safe_whatsapp_url(str(val)) if k == "whatsapp_url" else _safe_social_url(str(val))
            if k in secret_fields and isinstance(val, str):
                val = val.strip()
                if not val or val.startswith("…"):
                    continue  # blank or a read-only mask = keep the stored secret
            if k == "ai_task_routes":
                from ..services.llm import TASK_ROUTES
                if not isinstance(val, dict) or set(val) != set(TASK_ROUTES):
                    raise HTTPException(status_code=400, detail="Invalid AI task assignments")
                clean_routes = {}
                for task, route in val.items():
                    if not isinstance(route, dict):
                        raise HTTPException(status_code=400, detail=f"Invalid AI assignment for {task}")
                    provider = str(route.get("provider", "")).strip().lower()
                    model = str(route.get("model", "")).strip()
                    if provider not in {"openai", "gemini", "groq"} or not model or len(model) > 120:
                        raise HTTPException(status_code=400, detail=f"Invalid provider or model for {task}")
                    clean_routes[task] = {"provider": provider, "model": model}
                val = clean_routes
            if k in ("starter_price", "pro_price", "prime_price"):
                try:
                    if isinstance(val, bool):
                        raise ValueError
                    val = float(val)
                except (TypeError, ValueError) as exc:
                    raise HTTPException(status_code=400, detail=f"{k} must be a valid non-negative price") from exc
                if not math.isfinite(val) or val < 0:
                    raise HTTPException(status_code=400, detail=f"{k} must be a valid non-negative price")
            setattr(setting, k, val)
    setting.updated_date = datetime.utcnow()
    session.add(setting)
    session.commit()
    session.refresh(setting)

    # Invalidate resource search cache if YouTube API key was updated
    if "youtube_api_key" in data:
        try:
            from ..services.resources import _cache
            _cache.clear()
        except Exception:
            pass

    masked = setting.model_dump()
    masked.pop("ai_task_routes", None)
    for k in ("groq_api_key", "gemini_api_key", "openai_api_key", "youtube_api_key"):
        v = masked.get(k) or ""
        masked[k] = ("…" + v[-4:]) if len(v) > 4 else ("…" if v else "")
    return {"success": True, "settings": masked}
