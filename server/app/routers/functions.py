"""
Functions router - 14 AI backend functions mapped to POST /api/functions/{name}
"""
from fastapi import APIRouter, Body
from sqlmodel import Session, select
from typing import Optional
import uuid
import re
from datetime import datetime, timedelta
from ..core.database import get_session, engine
from fastapi import Depends
from ..core.deps import get_current_user_id, get_optional_user_id, require_admin, get_user_subscription_info, TIER_RANKS
from ..models import User, Roadmap, Lesson, Conversation, LearningProfile, Task, LessonProgress
from ..services.llm import (
    discovery_agent, planning_agent, execution_agent, research_career_market,
    recommend_goals_agent, search_jobs_agent, rewrite_text_agent,
    _looks_like_leak, is_broad_ai_goal
)
from fastapi import HTTPException

def _credit_response():
    return {"reply": "عذراً يا صاحبي، رصيد الـ AI خلص حالياً، جرّب بعد الشحن 💳", "credit_exhausted": True, "toast": "رصيد الـ AI انتهى"}

# Quiz pass mark (single source of truth — shown in UI as 70%)
PASS_SCORE = 70

# Quiz quality bar (single source of truth — every serving path uses these).
QUIZ_MIN_QUESTIONS = 8
QUIZ_TARGET_QUESTIONS = 10


AI_ROADMAP_COVERAGE = {
    "Python fundamentals": ("python", "بايثون"),
    "linear algebra": ("linear algebra", "الجبر الخطي"),
    "probability and statistics": ("probability", "statistics", "احتمالات", "إحصاء", "الاحصاء"),
    "calculus essentials": ("calculus", "التفاضل", "التكامل"),
    "data handling with NumPy and pandas": ("numpy", "pandas", "تنظيف البيانات", "تحليل البيانات"),
    "SQL and databases": ("sql", "قواعد البيانات"),
    "classical machine learning": ("scikit-learn", "classical machine learning", "supervised learning", "التعلم الآلي", "تعلم الآلة"),
    "model validation and evaluation": ("cross-validation", "model evaluation", "precision", "recall", "تقييم النماذج", "التحقق من النماذج"),
    "deep learning": ("pytorch", "deep learning", "neural network", "التعلم العميق", "الشبكات العصبية"),
    "computer vision": ("computer vision", "opencv", "الرؤية الحاسوبية", "رؤية الكمبيوتر"),
    "natural language processing": ("natural language processing", "nlp", "معالجة اللغة", "معالجة اللغات"),
    "transformers": ("transformer", "hugging face", "ترانسفورمر"),
    "LLMs and retrieval applications": ("llm", "large language model", "rag", "retrieval-augmented", "نموذج لغوي", "الاسترجاع المعزز"),
    "deployment and APIs": ("deployment", "fastapi", "model serving", "نشر النماذج", "واجهات برمجة"),
    "Docker or cloud deployment": ("docker", "cloud", "السحابة"),
    "MLOps, experiment tracking, and monitoring": ("mlops", "mlflow", "experiment tracking", "model monitoring", "مراقبة النماذج"),
}

DATA_ANALYST_COVERAGE = {
    "spreadsheet analysis (Excel or Sheets)": ("excel", "spreadsheet", "google sheets", "جداول البيانات", "اكسل", "إكسل"),
    "practical statistics": ("statistics", "statistical", "average", "percentage", "الإحصاء", "احصاء", "المتوسط", "النسب"),
    "data cleaning and quality": ("data cleaning", "cleaning data", "clean data", "data quality", "تنظيف البيانات", "تنظيف", "جودة البيانات", "القيم المفقودة"),
    "SQL and relational data": ("sql", "relational database", "قواعد البيانات"),
    "visualization and dashboards": ("dashboard", "visualization", "power bi", "tableau", "مخططات", "تصور البيانات", "لوحة المعلومات", "لوحات المعلومات"),
    "business interpretation and recommendations": ("business question", "business insight", "business interpretation", "recommend", "storytelling", "business decision", "interpret results", "data storytelling", "findings", "توصية", "توصيات", "قرارات", "أسئلة العمل", "تفسير", "استنتاج", "النتائج"),
}


def _is_data_analyst_goal(goal: str, profile: dict) -> bool:
    role = " ".join(str(value or "") for value in (
        goal,
        (profile or {}).get("target_role"),
        (profile or {}).get("current_role"),
    ))
    return bool(re.search(
        r"data\s*anal(?:ysis|ytics|yst)|تحليل\s*(?:ال)?بيانات|داتا\s*أناليس",
        role,
        flags=re.IGNORECASE,
    ))


def _missing_data_analyst_topics(nodes: list) -> list:
    values = []
    for node in nodes if isinstance(nodes, list) else []:
        if not isinstance(node, dict):
            continue
        values.extend(node.get(key, "") for key in ("title", "phase_title", "phase_objective", "objective"))
        for key in ("skills", "tools", "tasks", "projects"):
            entries = node.get(key)
            if isinstance(entries, list):
                values.extend(entries)
    roadmap_text = " ".join(str(value) for value in values if value).casefold()
    return [
        topic for topic, indicators in DATA_ANALYST_COVERAGE.items()
        if not any(indicator.casefold() in roadmap_text for indicator in indicators)
    ]


def _missing_broad_ai_topics(nodes: list) -> list:
    values = []
    for node in nodes if isinstance(nodes, list) else []:
        if not isinstance(node, dict):
            continue
        values.extend(node.get(key, "") for key in ("title", "phase_title", "phase_objective", "objective"))
        for key in ("skills", "tools", "tasks", "projects"):
            entries = node.get(key)
            if isinstance(entries, list):
                values.extend(entries)
    roadmap_text = " ".join(str(value) for value in values if value).casefold()
    return [
        topic for topic, indicators in AI_ROADMAP_COVERAGE.items()
        if not any(indicator.casefold() in roadmap_text for indicator in indicators)
    ]


def _missing_market_skills(nodes: list, required_skills: list) -> list:
    if not isinstance(required_skills, list):
        return []
    values = []
    for node in nodes if isinstance(nodes, list) else []:
        if not isinstance(node, dict):
            continue
        values.extend(node.get(key, "") for key in ("title", "phase_title", "phase_objective", "objective"))
        for key in ("skills", "tools", "tasks", "projects"):
            entries = node.get(key)
            if isinstance(entries, list):
                values.extend(entries)
    roadmap_text = " ".join(str(value) for value in values if value).casefold()
    roadmap_words = set(re.findall(r"[\w+#.]+", roadmap_text, flags=re.UNICODE))
    stop_words = {
        "and", "the", "with", "for", "using", "use", "from", "into",
        "basics", "fundamentals", "skills", "من", "في", "على", "مع",
    }
    missing = []
    for skill in required_skills:
        if not isinstance(skill, str) or not skill.strip():
            continue
        skill_text = skill.casefold().strip()
        if skill_text in roadmap_text:
            continue
        tokens = [token for token in re.findall(r"[\w+#.]+", skill_text, flags=re.UNICODE) if token not in stop_words]
        if not tokens or not roadmap_words.intersection(tokens) or len(roadmap_words.intersection(tokens)) / len(tokens) < 0.6:
            missing.append(skill)
    return missing


def _normalize_roadmap_nodes(nodes: list, lang: str = "ar") -> list:
    """Normalize optional fields and turn each node's final task into a milestone."""
    if not isinstance(nodes, list):
        return nodes
    normalized = [dict(node) if isinstance(node, dict) else node for node in nodes]
    phase_titles = {}
    phase_objectives = {}
    for node in normalized:
        if not isinstance(node, dict):
            continue
        phase = node.get("phase")
        if node.get("phase_title") and phase not in phase_titles:
            phase_titles[phase] = node["phase_title"]
        if node.get("phase_objective") and phase not in phase_objectives:
            phase_objectives[phase] = node["phase_objective"]
    used_ids = set()
    for index, node in enumerate(normalized, start=1):
        if not isinstance(node, dict):
            continue
        if node.get("tools") is None:
            node["tools"] = []
        if node.get("parent_ids") is None:
            node["parent_ids"] = []
        if node.get("resources") is None:
            node["resources"] = []
        projects = node.get("projects")
        if not isinstance(projects, list):
            projects = []
        projects = [project.strip() for project in projects if isinstance(project, str) and project.strip()]
        if not projects:
            tasks = node.get("tasks")
            final_task = next(
                (task.strip() for task in reversed(tasks or []) if isinstance(task, str) and task.strip()),
                None,
            ) if isinstance(tasks, list) else None
            title = str(node.get("title") or "").strip()
            if final_task:
                milestone = (
                    f"تطبيق عملي مصغر: {final_task}"
                    if lang == "ar"
                    else f"Practical milestone: {final_task}"
                )
            elif title:
                milestone = (
                    f"تطبيق عملي على {title}"
                    if lang == "ar"
                    else f"Practical exercise: {title}"
                )
            else:
                milestone = None
            if milestone:
                projects = [milestone]
        node["projects"] = projects[:2]
        if not isinstance(node.get("id"), str) or not node["id"].strip():
            candidate_id = f"lesson-{index}"
            while candidate_id in used_ids:
                candidate_id += "-next"
            node["id"] = candidate_id
        used_ids.add(node["id"])
        phase = node.get("phase")
        if not node.get("phase_title"):
            node["phase_title"] = phase_titles.get(phase) or (
                f"المرحلة {phase}" if lang == "ar" else f"Phase {phase}"
            )
        if not node.get("phase_objective"):
            node["phase_objective"] = (
                phase_objectives.get(phase)
                or node.get("objective")
                or node.get("title")
                or f"Complete phase {phase}"
            )
    if len(normalized) >= 6 and all(
        isinstance(node, dict)
        and isinstance(node.get("phase"), (int, float))
        and not isinstance(node.get("phase"), bool)
        for node in normalized
    ):
        phase_values = sorted({node["phase"] for node in normalized})
        phase_counts = {
            phase: sum(node["phase"] == phase for node in normalized)
            for phase in phase_values
        }
        if any(count < 2 for count in phase_counts.values()):
            target_phase_count = max(3, min(len(phase_values), len(normalized) // 2))
            group_size, remainder = divmod(len(normalized), target_phase_count)
            groups = []
            start = 0
            for group_index in range(target_phase_count):
                size = group_size + (1 if group_index < remainder else 0)
                groups.append(normalized[start:start + size])
                start += size
            for phase, group in enumerate(groups, start=1):
                titles = list(dict.fromkeys(
                    str(node.get("phase_title") or "").strip()
                    for node in group if str(node.get("phase_title") or "").strip()
                ))
                objectives = list(dict.fromkeys(
                    str(node.get("phase_objective") or "").strip()
                    for node in group if str(node.get("phase_objective") or "").strip()
                ))
                phase_title = " / ".join(titles)
                phase_objective = "؛ ".join(objectives) if lang == "ar" else " — ".join(objectives)
                for node in group:
                    node["phase"] = phase
                    node["phase_title"] = phase_title
                    node["phase_objective"] = phase_objective
    return normalized


def _validate_roadmap_nodes(nodes: list) -> list:
    issues = []

    def reject(reason):
        issues.append(reason)
        return issues

    if not isinstance(nodes, list) or len(nodes) < 6:
        return reject("expected a complete roadmap with at least 6 lesson nodes")
    phases = set()
    node_ids = set()
    for node in nodes:
        if not isinstance(node, dict):
            return reject("a roadmap node is not an object")
        required_nonempty = (
            "id", "title", "phase", "phase_title", "phase_objective",
            "objective", "skills", "estimated_hours", "tasks", "projects",
        )
        missing_fields = [key for key in required_nonempty if key not in node or not node[key]]
        if missing_fields:
            return reject(f"a node is missing required values: {', '.join(missing_fields)}")
        if not isinstance(node.get("tools"), list):
            return reject("a node has invalid tools; expected a list")
        if not isinstance(node.get("parent_ids"), list) or any(
            not isinstance(node.get(key), list)
            for key in ("skills", "tools", "tasks", "projects", "resources")
        ):
            return reject("a node has an invalid list field")
        if any(
            not isinstance(value, str) or not value.strip()
            for key in ("skills", "tools", "tasks", "projects")
            for value in node[key]
        ):
            return reject("a node contains an empty or non-text skill, tool, task, or project")
        if any(not isinstance(parent_id, str) for parent_id in node["parent_ids"]):
            return reject("a node contains a non-text prerequisite id")
        if (
            not isinstance(node["phase"], (int, float))
            or isinstance(node["phase"], bool)
            or node["phase"] < 1
            or not isinstance(node["estimated_hours"], (int, float))
            or isinstance(node["estimated_hours"], bool)
            or node["estimated_hours"] <= 0
        ):
            return reject("a node has an invalid phase or estimated duration")
        if (
            len(node["skills"]) < 2 or len(node["skills"]) > 5
            or not 3 <= len(node["tasks"]) <= 5
            or not 1 <= len(node["projects"]) <= 2
            or len(node["resources"]) > 3
        ):
            return reject("a node must have 2-5 skills, 3-5 tasks, 1-2 projects, and at most 3 resources")
        if any(
            not isinstance(resource, dict)
            or not isinstance(resource.get("title"), str)
            or not resource["title"].strip()
            for resource in node["resources"]
        ):
            return reject("a node contains a resource without a title")
        if not isinstance(node["id"], str) or not node["id"].strip() or node["id"] in node_ids:
            return reject("node ids are missing, non-text, or duplicated")
        node_ids.add(node["id"])
        phases.add(node["phase"])
    if any(parent_id not in node_ids or parent_id == node["id"] for node in nodes for parent_id in node["parent_ids"]):
        return reject("a prerequisite references a missing node or itself")
    if len(phases) < 3 or phases != set(range(1, len(phases) + 1)):
        return reject("the roadmap must contain at least 3 consecutive phases numbered from 1")
    if any(sum(1 for node in nodes if node["phase"] == phase) < 2 for phase in phases):
        return reject("each phase must contain multiple lessons")
    if any(not any(node["projects"] for node in nodes if node["phase"] == phase) for phase in phases):
        return reject("a phase has no portfolio project or milestone")
    return issues


def _is_valid_question(item) -> bool:
    """One question is renderable + gradable: text, 2 or 4 NON-EMPTY options,
    integer correct index inside range."""
    if not isinstance(item, dict):
        return False
    if not isinstance(item.get("question"), str) or not item["question"].strip():
        return False
    opts = item.get("options")
    if not isinstance(opts, list) or len(opts) not in (2, 4):
        return False
    if any(not isinstance(o, str) or not o.strip() for o in opts):
        return False
    if not isinstance(item.get("correct"), int):
        return False
    if isinstance(item["correct"], bool) or not 0 <= item["correct"] < len(opts):
        return False
    return len({option.strip().casefold() for option in opts}) == len(opts)


def _is_high_quality_question(item) -> bool:
    explanation = item.get("explanation") if isinstance(item, dict) else None
    return _is_valid_question(item) and isinstance(explanation, str) and len(explanation.strip()) >= 20


def _repair_quiz(questions, lang: str) -> list:
    """Fix the classic broken case from the screenshot: a true/false question
    with missing options. Fill canonical صح/خطأ (or True/False) when the type
    says true/false and correct is 0/1; drop anything else unfixable."""
    out = []
    tf_ar = ["صح", "خطأ"]
    tf_en = ["True", "False"]
    for q in questions or []:
        if not isinstance(q, dict):
            continue
        if _is_valid_question(q):
            out.append(q)
            continue
        qtype = str(q.get("type") or "").lower()
        opts = q.get("options")
        correct = q.get("correct")
        looks_tf = ("true" in qtype or "false" in qtype or "صح" in qtype or "خطأ" in qtype
                    or "صواب" in qtype or "tf" == qtype.strip())
        if (looks_tf and isinstance(q.get("question"), str) and q["question"].strip()
                and (not isinstance(opts, list) or len(opts) == 0)
                and isinstance(correct, int) and correct in (0, 1)):
            fixed = dict(q)
            fixed["options"] = list(tf_ar if lang == "ar" else tf_en)
            out.append(fixed)
    return out


async def _build_valid_quiz(generate_fn, want: int = QUIZ_TARGET_QUESTIONS, min_n: int = QUIZ_MIN_QUESTIONS) -> list:
    """Generate, repair, and top-up until min_n valid questions (2 attempts max).
    Returns [] when the LLM cannot produce a usable quiz (caller errors out)."""
    seen, valid = set(), []
    for _ in range(2):
        if len(valid) >= want:
            break
        try:
            got = await generate_fn()
        except Exception:
            got = []
        for q in got or []:
            key = (q.get("question") or "").strip().lower() if isinstance(q, dict) else ""
            if key and key not in seen and _is_high_quality_question(q):
                seen.add(key)
                valid.append(q)
            if len(valid) >= want:
                break
    return valid[:want] if len(valid) >= min_n else []

# Separate regeneration budgets per lesson (user decision: NOT shared).
CONTENT_REGEN_LIMIT = 3  # prepareLesson(regen=true): new content+quiz
VIDEO_REGEN_LIMIT = 3    # refreshVideo: swap to another video, same topic


def _regen_counts(session, user_id: str, lesson_id: str):
    """(content_regens_used, video_regens_used) from finished job rows."""
    from ..models import GenerationJob
    try:
        c = session.exec(select(GenerationJob).where(
            GenerationJob.kind == "lesson_regen", GenerationJob.ref_id == lesson_id,
            GenerationJob.user_id == user_id, GenerationJob.status == "done")).all()
        v = session.exec(select(GenerationJob).where(
            GenerationJob.kind == "lesson_video", GenerationJob.ref_id == lesson_id,
            GenerationJob.user_id == user_id, GenerationJob.status == "done")).all()
        return len(c), len(v)
    except Exception:
        return 0, 0


def _regen_limit_error(kind: str, lang: str):
    msg = ("خلصت محاولات إعادة التوليد (3/3) لهذا الدرس — المحتوى الحالي هو النسخة النهائية ✓"
           if kind == "content" else
           "خلصت محاولات تغيير الفيديو (3/3) لهذا الدرس — الفيديو الحالي هو النسخة النهائية ✓")
    if lang != "ar":
        msg = ("Content regeneration limit reached (3/3) for this lesson — current content is final ✓"
               if kind == "content" else
               "Video change limit reached (3/3) for this lesson — current video is final ✓")
    return {"error": "limit", "retry": False, "message": msg, "toast": msg}


def _enforce_function_tier(min_tier: str, user_id: str, session: Session, feature_name: str = "feature"):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if getattr(user, "role", "user") == "admin":
        return
    info = get_user_subscription_info(user, session)
    user_tier = info.get("tier", "NONE")
    if TIER_RANKS.get(user_tier, 0) < TIER_RANKS.get(min_tier, 0):
        status = info.get("status", "none")
        if status == "expired":
            msg = f"Subscription expired. Please renew your {min_tier} plan to access {feature_name}."
        else:
            msg = f"Feature restricted. Accessing {feature_name} requires an active {min_tier} plan."
        raise HTTPException(
            status_code=403,
            detail=msg,
            headers={"X-Required-Tier": min_tier, "X-Current-Tier": user_tier}
        )


def _friendly_error(stage: str = "general"):
    msgs = {
        "chat": "عطل بسيط في المحادثة، دوس إعادة المحاولة 🔄",
        "roadmap": "تعثر توليد الخريطة، تقديراتك محفوظة — دوس استكمال 🔄",
        "lesson": "المحتوى لم يكتمل، دوس إعادة التجهيز 🔄",
        "quiz": "تعثر تجهيز الاختبار، دوس إعادة المحاولة 🔄",
        "general": "حصل خطأ صغير، جرّب تاني 🙏",
    }
    msg = msgs.get(stage, msgs["general"])
    return {"reply": msg, "error": "temporary", "retry": True, "toast": msg, "stage": stage}


def _roadmap_error_response(error: str, job_id=None):
    messages = {
        "openai_not_configured": "توليد الخريطة محتاج تفعيل مفتاح OpenAI من إعدادات الذكاء الاصطناعي في لوحة الأدمن.",
        "openai_unavailable": "تعذر الاتصال بـ OpenAI لتوليد الخريطة. راجع اتصال الخادم وإعدادات OpenAI ثم أعد المحاولة.",
        "openai_invalid_response": "OpenAI رجّع خريطة غير مكتملة. أعد المحاولة؛ لم يتم حفظ خريطة ناقصة.",
        "openai_request_failed": "فشل طلب توليد الخريطة من OpenAI. راجع إعدادات الموديل والمفتاح في لوحة الأدمن ثم أعد المحاولة.",
        "openai_auth_failed": "مفتاح OpenAI المحفوظ غير مقبول. تأكد من حفظ المفتاح الصحيح في إعدادات الذكاء الاصطناعي.",
        "openai_rate_limited": "وصلت طلبات OpenAI إلى حد الاستخدام المؤقت. انتظر قليلًا ثم أعد المحاولة.",
        "openai_model_unavailable": "موديل OpenAI المحدد غير متاح لهذا المفتاح. غيّر الموديل من إعدادات الذكاء الاصطناعي.",
        "openai_timeout": "استغرق رد OpenAI وقتًا أطول من المتوقع. أعد المحاولة بعد قليل.",
        "incomplete_roadmap": "الخريطة المولدة ناقصها محتوى أساسي. أعد المحاولة لتوليد خطة مكتملة.",
    }
    message = messages.get(error, messages["openai_unavailable"])
    response = {"reply": message, "error": error, "retry": error != "openai_not_configured", "toast": message}
    if job_id:
        response["job_id"] = job_id
    return response


def _touch_job(session, job, **patch):
    for k, v in patch.items():
        if hasattr(job, k):
            setattr(job, k, v)
    job.updated_date = datetime.utcnow()
    session.add(job)
    session.commit()
    session.refresh(job)
    return job

def _to_iframe(url: str) -> str:
    """Convert watch?v= to nocookie embed for in-platform viewing."""
    try:
        import re
        m = re.search(r"(?:v=|youtu\.be/)([a-zA-Z0-9_-]{11})", url or "")
        if m:
            return f"https://www.youtube-nocookie.com/embed/{m.group(1)}"
        return url
    except:
        return url

def _unlock_next_lesson(session, user_id: str, roadmap_id: str, lesson_id: str):
    """Mark the lesson right after {lesson_id} (by order) as available.

    Single source of truth for progression unlocks — used by both quiz
    passes and approved phase projects.
    """
    stmt = select(Lesson).where(Lesson.user_id == user_id, Lesson.roadmap_id == roadmap_id).order_by(Lesson.order)
    all_lessons = session.exec(stmt).all()
    for i, ls in enumerate(all_lessons):
        if ls.id == lesson_id and i + 1 < len(all_lessons):
            nxt = all_lessons[i + 1]
            nxt.status = "available"
            session.add(nxt)
            return nxt.id
    return None

router = APIRouter()

@router.post("/discoveryChat")
async def discovery_chat(data: dict = Body(...), user_id: str = Depends(get_current_user_id)):
    messages = data.get("messages", [])
    profile = data.get("profile", {})
    companionName = data.get("companionName", "Zeus")
    lang = data.get("lang", "ar")
    result = await discovery_agent(messages, profile, companionName, lang)
    if result.get("credit_exhausted"):
        return _credit_response()
    return result

@router.post("/recommendGoals")
async def recommend_goals(data: dict = Body(...), user_id: str = Depends(get_current_user_id)):
    profile = data.get("profile", {})
    goal = data.get("goal", profile.get("goal", ""))
    lang = data.get("lang", "ar")
    result = await recommend_goals_agent(profile, goal, lang)
    if result.get("credit_exhausted"):
        return _credit_response()
    return result

@router.post("/generateRoadmap")
async def generate_roadmap(data: dict = Body(...), session: Session = Depends(get_session), user_id: str = Depends(get_current_user_id)):
    from ..models import GenerationJob
    profile = data.get("profile", {})
    goal = data.get("goal", profile.get("goal", ""))
    lang = data.get("lang", "ar")
    job_id = data.get("job_id")
    # Resume: continue from saved partial progress at any percentage
    resume_nodes = []
    job = None
    if job_id:
        job = session.get(GenerationJob, job_id)
        if job and (job.user_id != user_id):
            job = None
        if job and job.status == "running" and job.partial_nodes:
            resume_nodes = job.partial_nodes
    else:
        job = GenerationJob(kind="roadmap", goal=goal, user_id=user_id, status="running", progress=1, total=100, stage="fetching_base", partial_nodes=[])
        session.add(job)
        session.commit()
        session.refresh(job)
    try:
        # Stage 1: hidden base (10%)
        # Only use default beginner curriculum if user is beginner without prior known skills!
        # Intermediate / Advanced users must receive custom sequenced stages appropriate to their level.
        base_nodes = None
        user_level = (profile.get("current_level") or "beginner").lower()
        known_skills = profile.get("known_skills", []) or []
        if user_level in ("beginner", "junior", "مبتدئ") and not known_skills:
            try:
                from ..services.roadmap_sh import fetch_roadmap_sh
                sh = await fetch_roadmap_sh(goal)
                if sh and sh.get("nodes"):
                    base_nodes = sh["nodes"]
            except Exception as e:
                print(f"roadmap_sh fetch failed: {e}")
        market_research = None
        if not resume_nodes:
            if job:
                _touch_job(session, job, progress=18, stage="market_research", partial_nodes=[])
            try:
                market_research = await research_career_market(profile, goal, lang)
            except Exception as exc:
                print(f"roadmap market research failed ({type(exc).__name__})")
                market_research = None
        if not isinstance(market_research, dict):
            market_research = None
        if job:
            _touch_job(session, job, progress=25, stage="planning", partial_nodes=resume_nodes or [])
        # Stage 2: planning (enrich). Free-tier LLMs flake on the big call:
        # retry in-backend and accept only structurally valid roadmaps.
        broad_ai_goal = is_broad_ai_goal(goal)
        data_analyst_goal = _is_data_analyst_goal(goal, profile)
        validation_issues = []

        def _valid_nodes(ns):
            validation_issues.clear()
            validation_issues.extend(_validate_roadmap_nodes(ns))
            return not validation_issues

        result = None
        best_valid_result = None
        best_content_gap_count = None
        validation_feedback = ""
        for attempt in range(3):
            try:
                # On retries the base curriculum is trimmed: huge inputs make
                # small free-tier models truncate their JSON output.
                bn = base_nodes or (resume_nodes or None)
                if attempt > 0 and bn:
                    bn = bn[:6]
                if broad_ai_goal:
                    bn = None
                cand = await planning_agent(
                    profile,
                    goal,
                    lang,
                    base_nodes=bn,
                    market_research=market_research,
                    validation_feedback=validation_feedback,
                )
            except Exception as e:
                print(f"generateRoadmap planning fail (attempt {attempt+1}): {e}")
                cand = None
            if cand and isinstance(cand.get("nodes"), list):
                cand["nodes"] = _normalize_roadmap_nodes(cand["nodes"], lang)
            structurally_valid = bool(
                cand and not cand.get("error") and not cand.get("credit_exhausted")
                and _valid_nodes(cand.get("nodes", []))
            )
            missing_topics = _missing_broad_ai_topics(cand.get("nodes", [])) if cand and broad_ai_goal else []
            missing_data_analyst_topics = (
                _missing_data_analyst_topics(cand.get("nodes", []))
                if cand and data_analyst_goal else []
            )
            missing_market_skills = _missing_market_skills(
                (cand or {}).get("nodes", []),
                (market_research or {}).get("required_skills", []),
            )
            feedback_items = []
            if missing_topics:
                feedback_items.append(f"Required AI curriculum sections missing: {', '.join(missing_topics)}.")
            if missing_data_analyst_topics:
                feedback_items.append(
                    "Required Data Analyst curriculum sections missing; add dedicated lesson outcomes "
                    f"for: {', '.join(missing_data_analyst_topics)}."
                )
            if missing_market_skills:
                feedback_items.append(f"Explicitly include these researched job skills in lesson skills, objectives, tasks, or tools: {', '.join(missing_market_skills)}.")
            if cand and cand.get("nodes") and not structurally_valid:
                feedback_items.extend(validation_issues)
            validation_feedback = " ".join(feedback_items)
            if cand and cand.get("nodes") and not structurally_valid and validation_issues:
                print(
                    f"generateRoadmap: OpenAI draft rejected on attempt {attempt + 1} "
                    f"(nodes={len(cand.get('nodes', []))}, issues={'; '.join(validation_issues)})"
                )
            elif cand and cand.get("credit_exhausted"):
                result = cand
                break
            elif cand and cand.get("error"):
                if best_valid_result is None:
                    result = cand
                if cand.get("retry", True):
                    continue
                break
            elif structurally_valid:
                content_gap_count = (
                    len(missing_topics)
                    + len(missing_data_analyst_topics)
                    + len(missing_market_skills)
                )
                if (
                    (not data_analyst_goal or not missing_data_analyst_topics)
                    and (best_content_gap_count is None or content_gap_count < best_content_gap_count)
                ):
                    best_valid_result = cand
                    best_content_gap_count = content_gap_count
                result = cand
                if content_gap_count == 0:
                    break
            elif best_valid_result is None:
                result = cand
        if best_valid_result is not None:
            result = best_valid_result
        if result is None:
            raise RuntimeError("planning unreachable after 3 attempts")
        if result.get("credit_exhausted"):
            if job:
                _touch_job(session, job, status="running", error="credit")
                return {**_credit_response(), "job_id": job.id}
            return _credit_response()
        if result.get("error"):
            if job:
                _touch_job(session, job, status="running", error="temporary")
            return _roadmap_error_response(result["error"], job.id if job else job_id)
        nodes = result.get("nodes", []) or resume_nodes
        missing_data_analyst_topics = (
            _missing_data_analyst_topics(nodes) if data_analyst_goal else []
        )
        if missing_data_analyst_topics:
            print(
                "generateRoadmap: incomplete Data Analyst curriculum after 3 attempts "
                f"(missing={', '.join(missing_data_analyst_topics)})"
            )
            if job:
                _touch_job(session, job, status="running", error="temporary")
            return _roadmap_error_response("incomplete_roadmap", job.id if job else job_id)
        if not _valid_nodes(nodes):
            # Structurally unusable (truncated/empty): retryable, never save as a roadmap
            print(
                f"generateRoadmap: invalid nodes after 3 attempts, retryable "
                f"(nodes={len(nodes) if isinstance(nodes, list) else 'invalid'}, "
                f"issues={'; '.join(validation_issues) or 'unknown'})"
            )
            if job:
                _touch_job(session, job, status="running", error="temporary")
            return _roadmap_error_response("incomplete_roadmap", job.id if job else job_id)
        if job:
            _touch_job(session, job, status="done", progress=100, stage="done", partial_nodes=nodes, error=None)
        out = dict(result)
        out["job_id"] = job.id if job else job_id
        return out
    except Exception as e:
        print(f"generateRoadmap failed: {e}")
        if job:
            _touch_job(session, job, status="running", error="temporary")
            return {**_friendly_error("roadmap"), "job_id": job.id}
        return _friendly_error("roadmap")

@router.get("/jobs/latest")
async def latest_job(kind: str = "roadmap", session: Session = Depends(get_session), user_id: str = Depends(get_current_user_id)):
    from ..models import GenerationJob
    stmt = select(GenerationJob).where(GenerationJob.user_id == user_id, GenerationJob.kind == kind).order_by(GenerationJob.updated_date.desc()).limit(1)
    job = session.exec(stmt).first()
    if not job:
        return {"job": None}
    return {"job": job.model_dump()}

@router.post("/generateSchedule")
async def generate_schedule(data: dict = Body(...), session: Session = Depends(get_session), user_id: str = Depends(get_current_user_id)):
    roadmapId = data.get("roadmapId")
    availableDays = data.get("availableDays", []) or []
    lang = data.get("lang", "ar")
    # Fetch roadmap (owned by this user only)
    roadmap = session.get(Roadmap, roadmapId) if roadmapId else None
    if roadmap and roadmap.user_id != user_id:
        roadmap = None
    if not roadmap:
        # Try get latest active roadmap of this user
        stmt = select(Roadmap).where(Roadmap.user_id == user_id, Roadmap.status == "active").order_by(Roadmap.created_date.desc()).limit(1)
        roadmap = session.exec(stmt).first()
        if not roadmap:
            return {"lessons": []}
    nodes = roadmap.nodes or []
    # Create lessons: one per node, INTERLEAVED per phase so the linear
    # unlock order is phase1 lessons -> phase1 project -> phase2 lessons
    # -> phase2 project ... Day is stored as a weekday name (monday..sunday)
    # so the frontend can render "السبت - أسبوع 1".
    # Honor availableDays when provided by cycling through them.
    valid_days = [d for d in availableDays if d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")]
    lessons = []
    base_day = datetime.utcnow()

    def _day_week(order):
        if valid_days:
            return valid_days[order % len(valid_days)], (order // len(valid_days)) + 1
        day_date = base_day + timedelta(days=order)
        return day_date.strftime("%A").lower(), (order // 7) + 1

    def _add_lesson(node_id, node_title, phase, order, task=None):
        weekday, week = _day_week(order)
        lesson = Lesson(
            user_id=user_id,
            roadmap_id=roadmap.id,
            node_id=node_id,
            node_title=node_title,
            phase=phase,
            day=weekday,
            week=week,
            order=order,
            status="available" if order == 0 else "locked",
            task=task,
        )
        session.add(lesson)
        lessons.append(lesson)

    from collections import OrderedDict
    by_phase = OrderedDict()
    for _idx, node in enumerate(nodes):
        by_phase.setdefault(node.get("phase", 1), []).append((_idx, node))
    order = 0
    for ph in sorted(by_phase.keys()):
        phase_nodes = by_phase[ph]
        for _idx, node in phase_nodes:
            _add_lesson(node.get("id", f"node-{_idx}"), node.get("title", f"Node {_idx}"), ph, order)
            order += 1
        # Stage project closes the phase: finishing the phase's last lesson
        # opens it, and an approved project opens the next phase.
        titles = [n.get("title", "") for _, n in phase_nodes][:4]
        _add_lesson(
            f"stage_project_{ph}", f"Phase {ph} Project", ph, order,
            task={
                "title": f"Phase {ph} Project",
                "description": f"Apply everything you learned in phase {ph} ({', '.join(titles)}) in one small working project, then submit it for AI review.",
                "steps": ["Build the project following the brief", "Test it end-to-end", "Submit a short description + repo/link below"],
                "is_stage_project": True,
            },
        )
        order += 1
    session.commit()
    for ls in lessons:
        session.refresh(ls)
    return {"lessons": [ls.model_dump() for ls in lessons], "roadmapId": roadmap.id}

@router.post("/prepareLesson")
async def prepare_lesson(data: dict = Body(...), session: Session = Depends(get_session), user_id: str = Depends(get_current_user_id)):
    from ..models import GenerationJob
    lessonId = data.get("lessonId")
    lesson = session.get(Lesson, lessonId) if lessonId else None
    if not lesson or lesson.user_id != user_id:
        return {"error": "Lesson not found"}
    regen = bool(data.get("regen"))
    # Separate content budget: 3 regens per lesson (initial prepare is free).
    if regen:
        from ..models import LearningProfile as _LP0
        _prof0 = session.exec(select(_LP0).where(_LP0.user_id == user_id).order_by(_LP0.created_date.desc())).first()
        _lang0 = (_prof0.preferred_language if _prof0 and _prof0.preferred_language else "ar")
        _c_used, _ = _regen_counts(session, user_id, lessonId)
        if _c_used >= CONTENT_REGEN_LIMIT:
            return _regen_limit_error("content", _lang0)
    # Resume: reuse whatever stages already completed (content/video/quiz at any %).
    # Regenerations always open a FRESH job row so the 3-regen budget is countable.
    job = None
    try:
        if not regen:
            stmt_j = select(GenerationJob).where(GenerationJob.kind == "lesson", GenerationJob.ref_id == lessonId, GenerationJob.status == "running").order_by(GenerationJob.updated_date.desc()).limit(1)
            job = session.exec(stmt_j).first()
    except Exception:
        job = None
    if not job:
        job = GenerationJob(kind=("lesson_regen" if regen else "lesson"), ref_id=lessonId, user_id=user_id, status="running", progress=1, total=100, stage="content", partial_nodes=[])
        session.add(job)
        session.commit()
        session.refresh(job)
    # Generate content via LLM - task/quiz from actual content only, language/style aware
    from ..services.llm import _call_openai, ZEUS_SYSTEM
    import json
    # Fetch user preferences for language/style
    from ..models import LearningProfile
    from sqlmodel import select
    stmt = select(LearningProfile).where(LearningProfile.user_id == user_id).order_by(LearningProfile.created_date.desc()).limit(1)
    prof = session.exec(stmt).first()
    lang = (prof.preferred_language if prof and prof.preferred_language else "ar") if prof else "ar"
    # Track goal gives the lesson its context (prevents off-track content
    # such as a Node.js lesson inside an AI track).
    track_goal = ""
    roadmap_node = {}
    try:
        if lesson.roadmap_id:
            _rm = session.get(Roadmap, lesson.roadmap_id)
            if _rm and (not hasattr(_rm, "user_id") or _rm.user_id == user_id):
                track_goal = _rm.goal or ""
                roadmap_node = next(
                    (node for node in (_rm.nodes or []) if isinstance(node, dict) and node.get("id") == lesson.node_id),
                    {},
                )
    except Exception:
        track_goal = ""
    # Existing content is only a secondary reference: always lead with the
    # track goal + node title so regenerations can't drift off-topic.
    content_ref = lesson.reading_content or lesson.summary or ""
    content_hint = (
        f"Track goal: {track_goal or 'general learning'}. Node: {lesson.node_title} (phase {lesson.phase}). "
        f"Node objective: {roadmap_node.get('objective', '')}. "
        f"Skills to teach: {json.dumps(roadmap_node.get('skills', []), ensure_ascii=False)}. "
        f"Lesson tasks: {json.dumps(roadmap_node.get('tasks', []), ensure_ascii=False)}. "
        f"Roadmap lesson time estimate: {roadmap_node.get('estimated_hours', 'not specified')} hours. "
        f"Preferred lesson-video duration: {(prof.video_length_preference if prof and prof.video_length_preference else 'mixed')}. "
        "Use the node's stated objective and skills as the exact scope; do not drift to the whole track."
    )
    if content_ref:
        content_hint += f" Previous draft (first 1500 chars, rewrite it staying strictly on the node topic): {content_ref[:1500]}"
    prompt = (
        f"You are writing ONE lesson for the learning track: {track_goal or 'general learning'}. "
        f"Lesson node: {lesson.node_title} (phase {lesson.phase}). Language: {lang}. {content_hint} "
        "STRICT TOPIC RULE: every word must serve this exact node inside this exact track. "
        "Do NOT introduce unrelated technologies, languages, or frameworks (for example: never write about Node.js/npm in a Python/AI lesson unless the node title explicitly says so). "
        "Need: summary (2-3 sentences), reading_content (a detailed teacher-led lesson of about 900-1300 words, in markdown; explicitly teach each key idea in the node objective/skills; use a motivating explanation, step-by-step breakdown, terminology, at least two concrete worked examples including code when relevant, explain code/output line by line, realistic use cases, common mistakes and how to fix them, a short practice exercise with solution guidance, and a concise recap; avoid padding and unrelated topics). "
        "The content must be understandable without watching a video. Scale depth to the learner's level and the node's estimated time; do not compress a multi-hour lesson into a short summary. "
        "task {title, description, steps[3-4], applied_skills} where task steps practice the taught skills and commands - do NOT introduce untaught heavy tools. "
        "Do not generate video URLs; videos are separately searched and checked against this exact node. Respond JSON."
    )
    schema = {"type": "object", "properties": {"summary": {"type": "string"}, "reading_content": {"type": "string"}, "task": {"type": "object"}}, "required": ["summary", "reading_content", "task"]}
    try:
        result = None
        # Free-tier models flake on the big structured call: retry in-backend
        # so the user doesn't have to hammer "إعادة التجهيز" manually.
        for attempt in range(3):
            try:
                cand = await _call_openai(prompt, ZEUS_SYSTEM, schema, model="gpt-4o-mini", max_tokens=8500, task="planning")
            except Exception as e:
                print(f"prepareLesson LLM fail (attempt {attempt+1}): {e}")
                cand = None
            reading = cand.get("reading_content", "") if isinstance(cand, dict) else ""
            if cand and cand.get("summary") and len(reading.split()) >= 600 and not cand.get("error") and not cand.get("credit_exhausted"):
                result = cand
                break
            result = cand
        if result is None:
            raise RuntimeError("LLM unreachable after 3 attempts")
    except Exception as e:
        print(f"prepareLesson LLM fail: {e}")
        _touch_job(session, job, status="running", error="temporary")
        return {**_friendly_error("lesson"), "job_id": job.id}
    if result.get("credit_exhausted"):
        _touch_job(session, job, status="running", error="credit")
        return {**_credit_response(), "job_id": job.id}
    if result.get("error"):
        _touch_job(session, job, status="running", error="temporary")
        return {**_friendly_error("lesson"), "job_id": job.id}
    # Product guard: free-tier LLM sometimes returns unstructured text
    # (reply only, no content). Never mark a lesson ready with no content —
    # surface a retryable error so the frontend shows "إعادة التجهيز".
    if not result.get("summary") or len((result.get("reading_content") or "").split()) < 600:
        print("prepareLesson: LLM returned shallow or incomplete lesson content, retryable")
        _touch_job(session, job, status="running", error="temporary")
        return {**_friendly_error("lesson"), "job_id": job.id}
    # Update lesson with iframe + pdf + quiz from content
    from ..services.llm import generate_quiz_from_content
    content_for_quiz = (
        f"Lesson: {lesson.node_title}\nObjective: {roadmap_node.get('objective', '')}\n"
        f"Skills: {json.dumps(roadmap_node.get('skills', []), ensure_ascii=False)}\n\n"
        f"{result.get('reading_content', '') or lesson.reading_content or ''}"
    )

    async def _gen_repaired():
        try:
            r = await generate_quiz_from_content(content_for_quiz or lesson.node_title, lang, 10)
        except Exception:
            return []
        if isinstance(r, dict) and r.get("credit_exhausted"):
            return "__credit__"
        got = (r.get("questions", []) if isinstance(r, dict) else []) or []
        return [question for question in _repair_quiz(got, lang) if _is_high_quality_question(question)]

    # Build the assessment only after the full lesson is available so every
    # question can test taught material rather than a partial draft.
    valid = []
    seen = set()
    credit = False
    for _ in range(2):
        if len(valid) >= QUIZ_TARGET_QUESTIONS:
            break
        got = await _gen_repaired()
        if got == "__credit__":
            credit = True
            break
        for q in got:
            key = (q.get("question") or "").strip().casefold()
            if key and key not in seen:
                seen.add(key)
                valid.append(q)
            if len(valid) >= QUIZ_TARGET_QUESTIONS:
                break
    if credit and not valid:
        return _credit_response()
    quiz = valid[:QUIZ_TARGET_QUESTIONS] if len(valid) >= QUIZ_MIN_QUESTIONS else []
    # Existing saved URL is a candidate too: kept when still playable,
    # replaced when dead — so regenerations fix "Video unavailable" lessons.
    vurl = result.get("video_url") or lesson.video_url or ""
    vtitle = None
    vdur = 0
    # YouTube-only + must actually play in the iframe. The LLM often returns
    # hallucinated, deleted, or embedding-disabled videos ("Video unavailable"),
    # and sometimes non-YouTube sites — all are rejected and replaced.
    # regen=true (from the lesson "Regenerate" button) forces a DIFFERENT video
    # about the same topic instead of keeping the current one.
    regen = bool(data.get("regen"))
    # Single source of truth: prefer the node's top-ranked roadmap resource
    # (the same video the user sees in خريطتي), so both views agree.
    node_top_video = ""
    try:
        if lesson.roadmap_id:
            _rm2 = session.get(Roadmap, lesson.roadmap_id)
            if _rm2 and (not hasattr(_rm2, "user_id") or _rm2.user_id == user_id):
                for _nd in (_rm2.nodes or []):
                    if _nd.get("id") == lesson.node_id:
                        for _r in sorted(_nd.get("resources") or [], key=lambda x: x.get("rank", 99)):
                            if _r.get("type") == "video" and _r.get("url"):
                                node_top_video = _r["url"]
                                break
                        break
    except Exception:
        node_top_video = ""
    try:
        from ..services.resources import resolve_lesson_video
        _preferred_length = prof.video_length_preference if prof and prof.video_length_preference else "mixed"
        vurl, vtitle, vdur = await resolve_lesson_video(
            node_top_video or vurl,
            lesson.node_title,
            lang,
            goal=track_goal,
            exclude_url=(lesson.video_url if regen else ""),
            objective=roadmap_node.get("objective", ""),
            preferred_length=_preferred_length,
        )
    except Exception as e:
        print(f"video resolve fail: {e}")
        vurl, vtitle, vdur = "", None, 0
    if vtitle and not lesson.video_title:
        lesson.video_title = vtitle
    # Daily time budget from the user's DNA (weekly_hours ÷ free days).
    # The best video always wins; when it exceeds the day we flag it so the
    # UI can suggest splitting it across days.
    daily_minutes = 0
    try:
        wh = float(prof.weekly_hours) if prof and prof.weekly_hours else 0
        days_n = len(prof.available_days or []) if prof and prof.available_days else 7
        if wh > 0:
            daily_minutes = round(wh * 60 / max(1, days_n))
    except Exception:
        daily_minutes = 0
    if result.get("summary"):
        lesson.summary = result["summary"]
    if result.get("reading_content"):
        lesson.reading_content = result["reading_content"]
    if quiz:
        lesson.quiz = quiz
    elif lesson.quiz and not all(_is_valid_question(i) for i in (lesson.quiz or [])):
        # Purge a stale broken quiz (e.g. T/F with no options) so the next
        # generateQuiz call rebuilds it instead of serving it again.
        lesson.quiz = []
    if result.get("task"):
        lesson.task = result["task"]
    # Never wipe a working video: only overwrite when the resolver actually
    # found a playable replacement (regen failures keep the old video).
    if vurl:
        lesson.video_url = vurl
        lesson.video_iframe_url = _to_iframe(vurl)
        lesson.video_verified = True
        lesson.video_duration = int(vdur or 0)
    elif not lesson.video_url:
        lesson.video_verified = False
    # Try to attach a pdf from resources if reading/mixed
    try:
        from ..services.resources import get_resources_for_node
        res_list = await get_resources_for_node(
            {
                **roadmap_node,
                "id": lesson.node_id,
                "title": lesson.node_title,
                "objective": roadmap_node.get("objective") or lesson.summary or "",
            },
            prof.model_dump() if prof else {"preferred_language": lang, "learning_style": "mixed"},
            goal=track_goal,
        )
        pdfs = [r for r in res_list if r.get("type") == "docs"]
        if pdfs:
            lesson.pdf_url = pdfs[0].get("url")
            lesson.pdf_iframe_ready = True
            # Proxy to hide external source
            lesson.resources = [{"title": r.get("title"), "type": r.get("type"), "tier": "best_match", "url": ("/api/media/pdf?url=" + r.get("url") if r.get("type") == "docs" else r.get("url"))} for r in res_list]
    except Exception as e:
        print(f"pdf attach fail: {e}")
    lesson.quiz_passing_score = PASS_SCORE
    lesson.content_ready = True
    lesson.updated_date = datetime.utcnow()
    session.add(lesson)
    session.commit()
    session.refresh(lesson)
    _touch_job(session, job, status="done", progress=100, stage="done", error=None)
    # Re-refresh AFTER _touch_job: its commit expires lesson attributes,
    # and model_dump on expired attrs serializes to {} (frontend got only job_id).
    session.refresh(lesson)
    out = lesson.model_dump()
    out["job_id"] = job.id
    out["daily_minutes"] = daily_minutes
    out["video_over_budget"] = bool(daily_minutes and vdur and vdur > daily_minutes * 60)
    _cu, _vu = _regen_counts(session, user_id, lessonId)
    out["content_regens_left"] = max(0, CONTENT_REGEN_LIMIT - _cu)
    out["video_regens_left"] = max(0, VIDEO_REGEN_LIMIT - _vu)
    return out


@router.post("/refreshVideoMeta")
async def refresh_video_meta(data: dict = Body(...), session: Session = Depends(get_session), user_id: str = Depends(get_current_user_id)):
    """Backfill duration/title for lessons saved before durations existed (1 quota unit)."""
    from ..services.resources import _video_id_from_url, _video_meta
    lessonId = data.get("lessonId")
    lesson = session.get(Lesson, lessonId) if lessonId else None
    if not lesson or lesson.user_id != user_id:
        return {"error": "Lesson not found"}
    vid = _video_id_from_url(lesson.video_url or "")
    if not vid:
        return {"updated": False}
    meta = await _video_meta(vid)
    changed = False
    if meta.get("duration_sec") and not lesson.video_duration:
        lesson.video_duration = int(meta["duration_sec"])
        changed = True
    if meta.get("title") and not lesson.video_title:
        lesson.video_title = meta["title"]
        changed = True
    if changed:
        lesson.updated_date = datetime.utcnow()
        session.add(lesson)
        session.commit()
        session.refresh(lesson)
    return {"updated": changed, "video_duration": lesson.video_duration, "video_title": lesson.video_title}

@router.post("/refreshVideo")
async def refresh_video(data: dict = Body(...), session: Session = Depends(get_session), user_id: str = Depends(get_current_user_id)):
    """Change Video: swap current video for another one about the SAME lesson topic."""
    from ..models import GenerationJob
    lessonId = data.get("lessonId")
    lesson = session.get(Lesson, lessonId) if lessonId else None
    if not lesson or lesson.user_id != user_id:
        return {"error": "Lesson not found"}
    lang = data.get("lang", "ar")
    # Separate video budget: 3 swaps per lesson.
    _, _v_used = _regen_counts(session, user_id, lessonId)
    if _v_used >= VIDEO_REGEN_LIMIT:
        return _regen_limit_error("video", lang)
    track_goal = ""
    roadmap_node = {}
    try:
        if lesson.roadmap_id:
            _rm = session.get(Roadmap, lesson.roadmap_id)
            if _rm:
                track_goal = _rm.goal or ""
                roadmap_node = next(
                    (node for node in (_rm.nodes or []) if isinstance(node, dict) and node.get("id") == lesson.node_id),
                    {},
                )
    except Exception:
        track_goal = ""
    try:
        prof = session.exec(
            select(LearningProfile).where(LearningProfile.user_id == user_id)
            .order_by(LearningProfile.created_date.desc()).limit(1)
        ).first()
        from ..services.resources import resolve_lesson_video
        vurl, vtitle, vdur = await resolve_lesson_video(
            "", lesson.node_title, lang, goal=track_goal,
            exclude_url=lesson.video_url or "",
            objective=roadmap_node.get("objective", ""),
            preferred_length=prof.video_length_preference if prof and prof.video_length_preference else "mixed",
        )
    except Exception as e:
        print(f"refreshVideo fail: {e}")
        return {"error": "temporary", "retry": True}
    if not vurl:
        _cu0, _vu0 = _regen_counts(session, user_id, lessonId)
        return {"error": "temporary", "retry": True, "message": "No alternative video found — try again",
                "content_regens_left": max(0, CONTENT_REGEN_LIMIT - _cu0),
                "video_regens_left": max(0, VIDEO_REGEN_LIMIT - _vu0)}
    try:
        iframe = _to_iframe(vurl)
    except Exception:
        iframe = f"https://www.youtube-nocookie.com/embed/{vurl.split('v=')[-1].split('&')[0] if 'v=' in vurl else vurl.rsplit('/', 1)[-1]}"
    lesson.video_url = vurl
    lesson.video_iframe_url = iframe
    lesson.video_verified = True
    lesson.video_duration = int(vdur or 0)
    if vtitle:
        lesson.video_title = vtitle
    lesson.updated_date = datetime.utcnow()
    session.add(lesson)
    # Count this swap against the video budget.
    try:
        session.add(GenerationJob(kind="lesson_video", ref_id=lessonId, user_id=user_id,
                                  status="done", progress=100, total=100, stage="video"))
    except Exception as e:
        print(f"video job row fail: {e}")
    # Back-propagate: the verified lesson video becomes the node's rank-1
    # resource so Roadmap/Schedule/Home show the SAME video (unified).
    try:
        if lesson.roadmap_id:
            _rm2 = session.get(Roadmap, lesson.roadmap_id)
            if _rm2 and (not hasattr(_rm2, "user_id") or _rm2.user_id == user_id) and _rm2.nodes:
                _nodes = []
                for _n in (_rm2.nodes or []):
                    if isinstance(_n, dict) and _n.get("id") == lesson.node_id:
                        _nn = dict(_n)
                        _res = [r for r in (_nn.get("resources") or []) if isinstance(r, dict)]
                        _verified = {"title": vtitle or lesson.video_title or lesson.node_title,
                                     "type": "video", "tier": "best_match", "url": vurl,
                                     "iframe_url": iframe, "rank": 1, "verified": True,
                                     "duration_sec": int(vdur or 0)}
                        _res = [_verified] + [r for r in _res if r.get("url") != vurl][:5]
                        for _i, _r in enumerate(_res):
                            _r["rank"] = _i + 1
                        _nn["resources"] = _res
                        _nodes.append(_nn)
                    else:
                        _nodes.append(_n)
                _rm2.nodes = _nodes
                _rm2.updated_date = datetime.utcnow()
                session.add(_rm2)
    except Exception as e:
        print(f"video backprop fail: {e}")
    session.commit()
    session.refresh(lesson)
    out = lesson.model_dump()
    _cu, _vu = _regen_counts(session, user_id, lessonId)
    out["content_regens_left"] = max(0, CONTENT_REGEN_LIMIT - _cu)
    out["video_regens_left"] = max(0, VIDEO_REGEN_LIMIT - _vu)
    return out


@router.post("/regenStatus")
async def regen_status(data: dict = Body(...), session: Session = Depends(get_session), user_id: str = Depends(get_current_user_id)):
    """Remaining separate budgets for a lesson: content regens + video swaps."""
    lessonId = data.get("lessonId")
    lesson = session.get(Lesson, lessonId) if lessonId else None
    if not lesson or lesson.user_id != user_id:
        return {"error": "Lesson not found"}
    _cu, _vu = _regen_counts(session, user_id, lessonId)
    return {"content_used": _cu, "content_left": max(0, CONTENT_REGEN_LIMIT - _cu),
            "video_used": _vu, "video_left": max(0, VIDEO_REGEN_LIMIT - _vu)}


@router.get("/lessonChat/{lesson_id}")
async def get_lesson_chat(
    lesson_id: str,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
):
    """Retrieve isolated chat history for this specific lesson and user."""
    stmt = select(Conversation).where(
        Conversation.user_id == user_id,
        Conversation.lesson_id == lesson_id,
        Conversation.type == "lesson"
    ).order_by(Conversation.updated_date.desc()).limit(1)
    conv = session.exec(stmt).first()
    if not conv or not conv.messages:
        return {"messages": []}
    return {"messages": conv.messages}


@router.post("/lessonTutor")
async def lesson_tutor(
    data: dict = Body(...),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
):
    lessonId = data.get("lessonId")
    messages = data.get("messages", [])
    lang = data.get("lang", "ar")
    lesson = session.get(Lesson, lessonId) if lessonId else {"node_title": "General"}
    if hasattr(lesson, "user_id") and lesson.user_id != user_id:
        lesson = {"node_title": "General"}
    lesson_dict = lesson.model_dump() if hasattr(lesson, "model_dump") else lesson
    # Dynamic greeting: no fixed text — crafted by the LLM about THIS lesson.
    if data.get("greet") and not any(m.get("role") == "user" for m in messages):
        from ..services.llm import _call_openai, ZEUS_SYSTEM
        title = lesson_dict.get("node_title", "this lesson")
        summ = (lesson_dict.get("summary") or "")[:600]
        glang = "Egyptian Arabic" if lang == "ar" else "English"
        greet_prompt = (
            f"You are the AI tutor for the lesson '{title}'. "
            f"Lesson summary: {summ} "
            f"Greet the student briefly (1-2 sentences, {glang}), reference the ACTUAL lesson topic, "
            "and ask one inviting hook question about it. No fixed template."
        )
        greet = await _call_openai(greet_prompt, ZEUS_SYSTEM,
                                   {"type": "object", "properties": {"reply": {"type": "string"}}},
                                   model="gpt-4o-mini", task="greet")
        if greet.get("credit_exhausted"):
            return _credit_response()
        gtext = (greet.get("reply") or "").strip()
        if not gtext:
            # One retry on transient LLM blips with a short backoff — still no canned text on failure.
            try:
                import asyncio
                await asyncio.sleep(2)
                greet2 = await _call_openai(greet_prompt + "\nAnswer NOW with the greeting.", ZEUS_SYSTEM,
                                            {"type": "object", "properties": {"reply": {"type": "string"}}},
                                            model="gpt-4o-mini", task="greet")
                if not greet2.get("error") and not greet2.get("credit_exhausted"):
                    gtext = (greet2.get("reply") or "").strip()
            except Exception as e:
                print(f"lesson greet retry fail: {e}")
            if not gtext:
                return {"error": "temporary", "retry": True, "reply": ""}
        messages = [{"role": "assistant", "content": gtext, "ts": datetime.utcnow().isoformat()}]
        if lessonId and hasattr(lesson, "id"):
            stmt = select(Conversation).where(
                Conversation.user_id == user_id,
                Conversation.lesson_id == lessonId,
                Conversation.type == "lesson"
            ).order_by(Conversation.updated_date.desc()).limit(1)
            conv = session.exec(stmt).first()
            if not conv:
                conv = Conversation(
                    user_id=user_id, lesson_id=lessonId, type="lesson", messages=messages,
                    created_date=datetime.utcnow(), updated_date=datetime.utcnow(),
                )
                session.add(conv)
                session.commit()
        return {"reply": gtext}
    result = await execution_agent(lesson_dict, messages, lang)
    if result.get("credit_exhausted"):
        return _credit_response()
    # Leak guard: never serve echoed instructions as a chat reply.
    if _looks_like_leak(result.get("reply") or ""):
        print(f"tutor leaked prompt echo, suppressing: {(result.get('reply') or '')[:200]}")
        return {"error": "temporary", "retry": True, "reply": ""}

    # Persist in DB: save isolated history for (user_id, lessonId)
    if lessonId:
        stmt = select(Conversation).where(
            Conversation.user_id == user_id,
            Conversation.lesson_id == lessonId,
            Conversation.type == "lesson"
        ).order_by(Conversation.updated_date.desc()).limit(1)
        conv = session.exec(stmt).first()
        reply_text = (result.get("reply") or "").strip()
        new_msgs = list(messages)
        if reply_text and (not new_msgs or new_msgs[-1].get("role") != "assistant"):
            new_msgs.append({"role": "assistant", "content": reply_text, "ts": datetime.utcnow().isoformat()})
        if not conv:
            conv = Conversation(
                user_id=user_id,
                lesson_id=lessonId,
                type="lesson",
                messages=new_msgs,
                created_date=datetime.utcnow(),
                updated_date=datetime.utcnow(),
            )
            session.add(conv)
        else:
            conv.messages = new_msgs
            conv.updated_date = datetime.utcnow()
            session.add(conv)
        session.commit()

    return result


@router.post("/companionChat")
async def companion_chat(
    data: dict = Body(...),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
):
    messages = data.get("messages", [])
    lang = data.get("lang", "ar")

    # Fetch real user records from database to maintain genuine context
    prof = session.exec(
        select(LearningProfile).where(LearningProfile.user_id == user_id).order_by(LearningProfile.created_date.desc())
    ).first()
    roadmap = session.exec(
        select(Roadmap).where(Roadmap.user_id == user_id, Roadmap.status == "active").order_by(Roadmap.created_date.desc())
    ).first()
    completed_lessons = session.exec(
        select(Lesson).where(Lesson.user_id == user_id, Lesson.status == "completed")
    ).all()
    current_lesson = session.exec(
        select(Lesson).where(Lesson.user_id == user_id, Lesson.status == "available").order_by(Lesson.order)
    ).first()

    profile_dict = prof.model_dump() if prof else data.get("profile", {})
    roadmap_dict = roadmap.model_dump() if roadmap else data.get("roadmap", {})

    last_user_msg = next((m.get("content", "") for m in reversed(messages) if m.get("role") == "user"), "")

    # Requirement 7: AI can modify existing roadmaps and learning preferences
    profile_updated = False
    roadmap_updated = False
    t_lower = last_user_msg.lower()

    if any(k in t_lower for k in ["غير", "أغير", "تغيير", "change", "modify", "بدل", "عايز مقالات", "عايز فيديوهات", "ساعات", "وقتي", "also want"]):
        # Detect style change (e.g. user changes mind: videos only -> articles as well)
        if any(k in t_lower for k in ["مقالات", "قراءة", "articles", "reading", "docs", "كتب", "project", "مشاريع"]):
            if any(k in t_lower for k in ["فيديو", "فيديوهات", "videos", "both", "مع", "الاتنين", "أيضا", "برضو", "also"]):
                new_style = "mixed"
                new_types = ["video", "article", "project"]
            else:
                new_style = "reading"
                new_types = ["article", "reading"]
            if prof:
                prof.learning_style = new_style
                profile_updated = True
        elif any(k in t_lower for k in ["فيديوهات بس", "فيديو بس", "video only", "فيديوهات فقط"]):
            if prof:
                prof.learning_style = "video"
                profile_updated = True

        # Detect hours change
        import re
        m_hrs = re.search(r"(\d+(?:\.\d+)?)\s*(ساع|hours?|hrs?)", t_lower)
        if m_hrs and prof:
            try:
                prof.weekly_hours = float(m_hrs.group(1))
                profile_updated = True
            except Exception:
                pass

        if profile_updated and prof:
            prof.updated_date = datetime.utcnow()
            session.add(prof)
            # Apply changes into active Roadmap node resources
            if roadmap and roadmap.nodes:
                try:
                    from ..services.resources import get_resources_for_node
                    new_nodes = []
                    for nd in (roadmap.nodes or []):
                        nd_copy = dict(nd) if isinstance(nd, dict) else nd
                        # If node has resources, refresh them according to new style
                        if isinstance(nd_copy, dict) and nd_copy.get("resources"):
                            res_list = await get_resources_for_node(nd_copy, prof.model_dump(), goal=roadmap.goal or "", force=True)
                            if res_list:
                                nd_copy["resources"] = res_list
                        new_nodes.append(nd_copy)
                    roadmap.nodes = new_nodes
                    roadmap.updated_date = datetime.utcnow()
                    session.add(roadmap)
                    roadmap_updated = True
                except Exception as ex:
                    print(f"roadmap update fail: {ex}")
            session.commit()
            if prof:
                session.refresh(prof)
            if roadmap:
                session.refresh(roadmap)

    from ..services.llm import _call_openai, ZEUS_SYSTEM
    import json
    user_name = (getattr(prof, "full_name", "") or "").strip() if prof else ""
    user_goal = (getattr(prof, "goal", "") or roadmap_dict.get("goal") or "Learning") if (prof or roadmap_dict) else "Learning"
    cur_title = current_lesson.node_title if current_lesson else ""
    cur_phase = current_lesson.phase if current_lesson else 1
    # Dynamic greeting: no fixed text — crafted by the LLM from real context.
    if data.get("greet") or not any(m.get("role") == "user" for m in messages):
        glang = "Egyptian Arabic" if lang == "ar" else "English"
        greet_prompt = (
            f"Write a short warm greeting (1-2 sentences, {glang}) from ZEUS, the learning companion, "
            f"to a learner{f' named {user_name}' if user_name else ''} whose goal is '{user_goal}'. "
            f"They completed {len(completed_lessons)} lessons and are now at '{cur_title}' (Phase {cur_phase}). "
            "Mention ONE concrete thing about their actual progress/goal and invite them to ask or continue. "
            "No fixed template — sound like a real friend who knows them."
        )
        greet_schema = {"type": "object", "properties": {"reply": {"type": "string"}}}
        greet = await _call_openai(greet_prompt, ZEUS_SYSTEM, greet_schema, model="gpt-4o-mini", task="greet")
        if greet.get("credit_exhausted"):
            return _credit_response()
        gtext = (greet.get("reply") or "").strip()
        if not gtext:
            # One retry after a short backoff (free-tier rate blips) — still
            # no canned text on failure.
            try:
                import asyncio
                await asyncio.sleep(2)
                greet2 = await _call_openai(greet_prompt + "\nAnswer NOW with the greeting.", ZEUS_SYSTEM,
                                            greet_schema, model="gpt-4o-mini", task="greet")
                if not greet2.get("error") and not greet2.get("credit_exhausted"):
                    gtext = (greet2.get("reply") or "").strip()
            except Exception as e:
                print(f"companion greet retry fail: {e}")
        if not gtext:
            return {"error": "temporary", "retry": True, "reply": ""}
        return {"reply": gtext}
    hist = "\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages[-8:]])
    context_info = f"""
=== USER LEARNING CONTEXT ===
- Goal: {prof.goal if prof else roadmap_dict.get('goal', 'Learning')}
- Current Level: {prof.current_level if prof else 'beginner'}
- Learning Style: {prof.learning_style if prof else 'mixed'} (video_preference: {getattr(prof, 'video_preference', 'free')})
- Available Time: {prof.weekly_hours if prof else 0} hours/week, Days: {prof.available_days if prof else []}
- Completed Lessons: {len(completed_lessons)}
- Current Stage/Lesson: {current_lesson.node_title if current_lesson else 'In progress'} (Phase {current_lesson.phase if current_lesson else 1})
- Preferences Modified Just Now: {profile_updated}
"""
    prompt = f"Companion chat.\n{context_info}\nConversation History:\n{hist}\n\nUser asked: \"{last_user_msg}\"\nAnswer the user directly and warmly based on their exact learning goal, stage, and progress. If they requested a preference change (like adding articles or changing hours), confirm warmly that you have actually updated their profile and roadmap in the system! Reply in {'Egyptian Arabic' if lang=='ar' else 'English'}."

    result = await _call_openai(prompt, ZEUS_SYSTEM, None, model="gpt-4o-mini", task="companion")
    if result.get("credit_exhausted"):
        return _credit_response()
    # No canned reply by design: retry once, then honest retryable error.
    if not (result.get("reply") or "").strip():
        try:
            retry = await _call_openai(
                prompt + "\nYour previous reply was EMPTY. Answer the user NOW in the required language.",
                ZEUS_SYSTEM, None, model="gpt-4o-mini", task="companion")
            if (retry and not retry.get("error") and not retry.get("credit_exhausted")
                    and (retry.get("reply") or "").strip()):
                result = retry
        except Exception:
            pass
    if not (result.get("reply") or "").strip():
        return {"error": "temporary", "retry": True, "reply": ""}
    # Leak guard: never serve echoed instructions as a chat reply.
    if _looks_like_leak(result.get("reply") or ""):
        print(f"companion leaked prompt echo, suppressing: {(result.get('reply') or '')[:200]}")
        return {"error": "temporary", "retry": True, "reply": ""}

    result["profile_updated"] = profile_updated
    result["roadmap_updated"] = roadmap_updated
    return result

@router.post("/nodeResources")
async def node_resources(data: dict = Body(...), session: Session = Depends(get_session), user_id: str = Depends(get_current_user_id)):
    roadmapId = data.get("roadmapId")
    nodeId = data.get("nodeId")
    lang = data.get("lang", "ar")
    # exclude: already-seen videoIds (manual refresh brings something new);
    # force: bypass the 24h cache.
    exclude = tuple(data.get("exclude") or [])
    force = bool(data.get("force"))
    # Try real search respecting language/style first
    try:
        from ..services.resources import get_resources_for_node
        from ..models import LearningProfile
        from sqlmodel import select
        stmt = select(LearningProfile).where(LearningProfile.user_id == user_id).order_by(LearningProfile.created_date.desc()).limit(1)
        prof = session.exec(stmt).first()
        profile = prof.model_dump() if prof else {"preferred_language": lang, "learning_style": "mixed"}
        # Override lang if profile has it
        eff_lang = profile.get("preferred_language") or lang
        roadmap = session.get(Roadmap, roadmapId) if roadmapId else None
        if roadmap and roadmap.user_id != user_id:
            return {"resources": []}
        if roadmap and roadmap.nodes:
            for node in roadmap.nodes:
                if node.get("id") == nodeId:
                    real = await get_resources_for_node(node, profile, goal=roadmap.goal or "", exclude=exclude, force=force)
                    if real:
                        from ..services.resources import _is_youtube_url
                        # Convert to iframe for videos + proxy for docs to hide external source.
                        # Videos are YouTube-only: anything else is dropped.
                        out = []
                        for r in real:
                            url = r.get("url", "")
                            typ = r.get("type", "")
                            if typ == "video":
                                if not _is_youtube_url(url):
                                    continue
                                out.append({**r, "url": url, "iframe_url": _to_iframe(url)})
                            elif typ == "docs":
                                out.append({**r, "url": "/api/media/pdf?url=" + url, "original_url": url})
                            else:
                                out.append(r)
                        # Respect video_preference: free=youtube/docs only, mixed may include paid (mark tier)
                        vpref = (profile.get("video_preference") or "free")
                        if vpref == "free":
                            out = [x for x in out if "udemy" not in x.get("url","").lower() and "coursera" not in x.get("url","").lower()]
                        # Unified video: verify candidates in rank order (relevance +
                        # level fit) and pin the FIRST verified one as rank 1, so
                        # Roadmap/Schedule/Home/Lesson all show the SAME video.
                        try:
                            from ..services.resources import resolve_lesson_video
                            _level = (profile.get("current_level") or "")
                            _skills = ", ".join(skill for skill in (node.get("skills") or [])[:4] if isinstance(skill, str))
                            _goal_lvl = f"{roadmap.goal or ''} [{_level}]{(' skills: ' + _skills) if _skills else ''}"
                            _vids = [r for r in out if r.get("type") == "video"]
                            _verified = None
                            for _cand in _vids[:4]:
                                try:
                                    _vu2, _vt2, _vd2 = await resolve_lesson_video(
                                        _cand.get("url", ""), node.get("title", ""), eff_lang,
                                        goal=_goal_lvl,
                                        objective=node.get("objective", ""),
                                        preferred_length=profile.get("video_length_preference") or "mixed")
                                except Exception:
                                    continue
                                if _vu2:
                                    _verified = dict(_cand)
                                    _verified.update({"url": _vu2, "iframe_url": _to_iframe(_vu2),
                                                      "rank": 1, "verified": True})
                                    if _vt2:
                                        _verified["title"] = _vt2
                                    if _vd2:
                                        _verified["duration_sec"] = int(_vd2)
                                    break
                            if _verified:
                                out = [_verified] + [r for r in out if r.get("url") != _verified["url"]]
                                for _i, _r in enumerate(out):
                                    _r["rank"] = _i + 1
                        except Exception as e:
                            print(f"node video verify fail: {e}")
                        return {"resources": out}
                    # Fallback to LLM with language/style aware prompt
                    from ..services.llm import _call_openai, ZEUS_SYSTEM
                    import json
                    style = profile.get("learning_style", "mixed")
                    prompt = f"Find 5 high-quality free resources for learning node: {node.get('title')} - objective: {node.get('objective')} lang {eff_lang} style {style}. Return JSON {{resources: [{{title, type, tier, url, why}}]}} with real URLs (youtube if video, docs if reading, both if mixed) matching language {eff_lang}."
                    res = await _call_openai(prompt, ZEUS_SYSTEM, {"type":"object","properties":{"resources":{"type":"array"}}}, model="gpt-4o-mini")
                    if res.get("credit_exhausted"):
                        return _credit_response()
                    # Never trust URLs suggested by the model. Resolve any
                    # video request through the verified, lesson-specific search.
                    from ..services.resources import resolve_lesson_video
                    cleaned = []
                    fallback_video = None
                    for r in res.get("resources", []) or []:
                        if not isinstance(r, dict):
                            continue
                        if r.get("type") == "video":
                            if fallback_video is None:
                                try:
                                    fallback_video = await resolve_lesson_video(
                                        "",
                                        node.get("title", ""),
                                        eff_lang,
                                        objective=node.get("objective", ""),
                                        preferred_length=profile.get("video_length_preference") or "mixed",
                                    )
                                except Exception as exc:
                                    print(f"fallback video resolution failed ({type(exc).__name__})")
                            video_url, video_title, duration = fallback_video or ("", None, 0)
                            if not video_url or any(item.get("type") == "video" for item in cleaned):
                                continue
                            r = {
                                **r,
                                "title": video_title or r.get("title") or node.get("title", ""),
                                "url": video_url,
                                "duration_sec": duration,
                                "verified": True,
                            }
                        cleaned.append(r)
                    res["resources"] = cleaned
                    return res
    except Exception as e:
        print(f"nodeResources error: {e}")
    return {"resources": []}

@router.post("/searchResources")
async def search_resources(data: dict = Body(...), user_id: str = Depends(get_current_user_id)):
    # Bulk version - similar to nodeResources but for all nodes
    roadmapId = data.get("roadmapId")
    lang = data.get("lang", "ar")
    from ..core.database import get_session
    from sqlmodel import Session
    with Session(engine) as session:
        roadmap = session.get(Roadmap, roadmapId) if roadmapId else None
        if not roadmap:
            return {"resources": []}
        # For MVP return empty, frontend uses nodeResources per node
        return {"resources": []}

@router.post("/searchJobs")
async def search_jobs(
    data: dict = Body(...),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
):
    _enforce_function_tier("PRIME", user_id, session, "Job search and recommendations")
    profile = data.get("profile", {})
    cv = data.get("cv", {})
    lang = data.get("lang", "ar")
    result = await search_jobs_agent(profile, cv, lang)
    if result.get("credit_exhausted"):
        return _credit_response()
    # Normalize: every job gets a usable apply link (apply_url > url >
    # LinkedIn search fallback) so the frontend "Apply" button always works.
    import urllib.parse
    for job in result.get("jobs", []) or []:
        if not isinstance(job, dict):
            continue
        link = (job.get("apply_url") or job.get("url") or "").strip()
        if not (link.startswith("http://") or link.startswith("https://")):
            q = urllib.parse.quote(f"{job.get('title', '')} {job.get('company', '')} jobs".strip() or "jobs")
            link = f"https://www.linkedin.com/jobs/search/?keywords={q}"
        job["apply_url"] = link
        job.setdefault("url", link)
        try:
            job["match_score"] = int(job.get("match_score", 0) or 0)
        except Exception:
            job["match_score"] = 0
    return result

@router.post("/rewriteSummary")
async def rewrite_summary(
    data: dict = Body(...),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
):
    _enforce_function_tier("PRIME", user_id, session, "CV builder AI rewriter")
    summary = data.get("summary", "")
    is_ar = data.get("profile", False) or data.get("isAr", False)
    if isinstance(is_ar, str):
        is_ar = is_ar == "ar"
    result = await rewrite_text_agent(summary, bool(is_ar), kind="CV summary")
    if isinstance(result, dict) and result.get("credit_exhausted"):
        return _credit_response()
    if isinstance(result, str):
        return {"rewritten": result}
    return result if isinstance(result, dict) and "rewritten" in result else {"rewritten": result.get("reply", summary)}

@router.post("/rewriteProjectDescription")
async def rewrite_project_description(
    data: dict = Body(...),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
):
    _enforce_function_tier("PRO", user_id, session, "Project description AI rewriter")
    description = data.get("description", "")
    is_ar = data.get("isAr", False)
    result = await rewrite_text_agent(description, bool(is_ar), kind="project description")
    if isinstance(result, dict) and result.get("credit_exhausted"):
        return _credit_response()
    if isinstance(result, str):
        return {"rewritten": result}
    return result if isinstance(result, dict) and "rewritten" in result else {"rewritten": result.get("reply", description)}

@router.post("/joinCommunity")
async def join_community(data: dict = Body(...), session: Session = Depends(get_session), admin: User = Depends(require_admin)):
    """Admin-only now: users are assigned to communities by the admin
    (self-join removed). Accepts an explicit user_id to add/remove."""
    communityId = data.get("communityId")
    action = data.get("action", "join")
    target_id = data.get("user_id") or admin.id
    from ..models import Community
    comm = session.get(Community, communityId)
    if not comm:
        return {"error": "Community not found"}
    if not session.get(User, target_id):
        return {"error": "User not found"}
    members = list(comm.members or [])
    if action == "join" and target_id not in members:
        members.append(target_id)
    elif action == "leave" and target_id in members:
        members.remove(target_id)
    # Assign a NEW list object: SQLAlchemy does not track in-place
    # mutations of JSON columns, so reusing the loaded list silently
    # drops the update (leave appeared to work but never persisted).
    comm.members = list(members)
    comm.member_count = len(members)
    comm.updated_date = datetime.utcnow()
    session.add(comm)
    session.commit()
    session.refresh(comm)
    return comm.model_dump()

@router.post("/generateQuiz")
async def generate_quiz(data: dict = Body(...), session: Session = Depends(get_session), user_id: str = Depends(get_current_user_id)):
    """10 mixed questions from lesson content, 70% to pass. Creates/updates LessonProgress."""
    from ..services.llm import generate_quiz_from_content
    from ..models import LessonProgress
    lessonId = data.get("lessonId")
    lang = data.get("lang", "ar")
    lesson = session.get(Lesson, lessonId) if lessonId else None
    if not lesson or lesson.user_id != user_id:
        return _friendly_error()
    content = f"Lesson: {lesson.node_title}\nSummary: {lesson.summary or ''}\n\n{lesson.reading_content or lesson.summary or lesson.node_title}"
    # Validate + repair + top-up: NEVER serve or persist a broken quiz
    # (e.g. T/F with no options left the user stuck, unable to submit).
    seen, valid = set(), []
    credit = False
    for _ in range(2):
        if len(valid) >= QUIZ_TARGET_QUESTIONS:
            break
        try:
            res = await generate_quiz_from_content(content, lang, 10)
        except Exception:
            res = {}
        if isinstance(res, dict) and res.get("credit_exhausted"):
            credit = True
            break
        if isinstance(res, dict) and res.get("error"):
            break
        for q in _repair_quiz(res.get("questions", []) if isinstance(res, dict) else [], lang):
            if not _is_high_quality_question(q):
                continue
            key = (q.get("question") or "").strip().lower()
            if key and key not in seen:
                seen.add(key)
                valid.append(q)
            if len(valid) >= QUIZ_TARGET_QUESTIONS:
                break
    if credit and not valid:
        return _credit_response()
    questions = valid[:QUIZ_TARGET_QUESTIONS]
    if len(questions) < QUIZ_MIN_QUESTIONS:
        # Honest failure (frontend shows retry) instead of an unsubmittable quiz.
        # Keep any previously stored VALID quiz so the user isn't left empty.
        if lesson.quiz and len(lesson.quiz) >= QUIZ_MIN_QUESTIONS and all(_is_valid_question(i) for i in (lesson.quiz or [])):
            questions = lesson.quiz
        else:
            return {"error": "temporary", "retry": True,
                    "message": "تعذّر تجهيز الاختبار — حاول تاني" if lang == "ar" else "Couldn't build the quiz — retry",
                    "toast": "تعذّر تجهيز الاختبار" if lang == "ar" else "Quiz build failed"}
    # Persist the served questions as the single source of truth: submitQuiz
    # grades against lesson.quiz, so serving unsaved questions used to mark
    # correct answers wrong whenever the fresh set differed from the stored one.
    if questions:
        lesson.quiz = questions
        lesson.updated_date = datetime.utcnow()
        session.add(lesson)
    # Ensure LessonProgress row
    stmt = select(LessonProgress).where(LessonProgress.lesson_id == lessonId, LessonProgress.user_id == user_id)
    prog = session.exec(stmt).first()
    if not prog:
        prog = LessonProgress(lesson_id=lessonId, user_id=user_id, status="in_progress", attempts=0)
        session.add(prog)
        session.commit()
        session.refresh(prog)
    else:
        session.commit()
        session.refresh(lesson)
    return {"questions": questions, "passing_score": PASS_SCORE, "progress_id": prog.id}

@router.post("/submitQuiz")
async def submit_quiz(data: dict = Body(...), session: Session = Depends(get_session), user_id: str = Depends(get_current_user_id)):
    """Grade quiz (10 Q, mixed types), unlock next lesson on backend only if >=70%."""
    from ..models import LessonProgress
    lessonId = data.get("lessonId")
    answers = data.get("answers", {})  # {index: choice}
    lesson = session.get(Lesson, lessonId) if lessonId else None
    if not lesson or lesson.user_id != user_id:
        return _friendly_error()
    quiz = [q for q in (lesson.quiz or []) if _is_valid_question(q)]
    if not quiz:
        return _friendly_error()
    correct = 0
    # Grade by position within the VALID subset so legacy stored indexes stay aligned.
    valid_idx = 0
    for idx, q in enumerate(lesson.quiz or []):
        if not _is_valid_question(q):
            continue
        try:
            raw = answers.get(str(valid_idx), answers.get(valid_idx, answers.get(str(idx), answers.get(idx, -1))))
            given = int(raw)
            want = int(q.get("correct", -2))
            # A missing answer (-1) must never count, even if the stored
            # question is malformed.
            if given != -1 and given == want:
                correct += 1
        except:
            pass
        finally:
            valid_idx += 1
    score = int(round(correct / max(1, len(quiz)) * 100))
    passed = score >= PASS_SCORE
    stmt = select(LessonProgress).where(LessonProgress.lesson_id == lessonId, LessonProgress.user_id == user_id)
    prog = session.exec(stmt).first()
    if not prog:
        prog = LessonProgress(lesson_id=lessonId, user_id=user_id)
    prog.attempts = (prog.attempts or 0) + 1
    prog.quiz_score = score
    prog.quiz_answers = answers
    if passed:
        prog.status = "completed"
        prog.completed_at = datetime.utcnow()
        lesson.status = "completed"
        lesson.quiz_passed = True
        lesson.quiz_score = score
        lesson.completed_date = datetime.utcnow().isoformat()[:10]
        session.add(lesson)
        # Mirror completion into Tasks of the same node so Progress/Home
        # (which aggregate Tasks) move as lessons pass.
        from ..models import Task
        node_tasks = session.exec(
            select(Task).where(Task.user_id == user_id, Task.node_id == lesson.node_id)
        ).all()
        for tk in node_tasks:
            tk.status = "done"
            tk.completed_date = datetime.utcnow().isoformat()[:10]
            tk.updated_date = datetime.utcnow()
            session.add(tk)
        # Mark the roadmap node completed when all its lessons pass, so the
        # roadmap tree, phase progress and skills all move with real progress.
        try:
            from ..models import Roadmap as _Roadmap, LearningProfile as _LP
            _rm = session.get(_Roadmap, lesson.roadmap_id)
            if _rm and (not hasattr(_rm, "user_id") or _rm.user_id == user_id):
                _nodes = _rm.nodes or []
                _done_node_ids = {
                    ls.node_id for ls in session.exec(
                        select(Lesson).where(
                            Lesson.user_id == user_id,
                            Lesson.roadmap_id == lesson.roadmap_id,
                            Lesson.status == "completed",
                        )
                    ).all()
                } | {lesson.node_id}
                _changed = False
                _new_nodes = []
                for _n in _nodes:
                    # Copy the dict: assigning the same mutated objects back
                    # does not reliably mark the JSON column dirty.
                    _nn = dict(_n) if isinstance(_n, dict) else _n
                    if isinstance(_nn, dict) and _nn.get("id") in _done_node_ids and _nn.get("status") != "completed":
                        _nn["status"] = "completed"
                        _changed = True
                    _new_nodes.append(_nn)
                if _changed:
                    _rm.nodes = _new_nodes
                    _rm.updated_date = datetime.utcnow()
                    session.add(_rm)
            # Evolve DNA skills: applied skills from the passed lesson gain +10
            # (cap 100) so "تطور مهاراتي" visibly moves with real progress.
            _task = lesson.task or {}
            _applied = [s for s in (_task.get("applied_skills") or []) if isinstance(s, str)]
            if _applied:
                _prof = session.exec(
                    select(_LP).where(_LP.user_id == user_id).order_by(_LP.created_date.desc())
                ).first()
                if _prof and isinstance(_prof.skill_graph, list):
                    _graph = []
                    _seen = set()
                    for _g in _prof.skill_graph:
                        if not isinstance(_g, dict) or "skill" not in _g:
                            continue
                        _lvl = int(_g.get("level", 0) or 0)
                        if any(_g["skill"].lower() in a.lower() or a.lower() in _g["skill"].lower() for a in _applied):
                            _lvl = min(100, _lvl + 10)
                        _graph.append({"skill": _g["skill"], "level": _lvl})
                        _seen.add(_g["skill"].lower())
                    for _a in _applied:
                        if _a.lower() not in _seen:
                            _graph.append({"skill": _a, "level": 10})
                    _prof.skill_graph = _graph
                    _prof.updated_date = datetime.utcnow()
                    session.add(_prof)
        except Exception as _e:
            print(f"progress mirror fail: {_e}")
        # Unlock next lesson by order (backend-computed single source of truth)
        next_lesson_id = _unlock_next_lesson(session, user_id, lesson.roadmap_id, lessonId)
    else:
        prog.status = "in_progress"
        next_lesson_id = None
    session.add(prog)
    session.commit()
    session.refresh(prog)
    return {"score": score, "passed": passed, "attempts": prog.attempts, "next_lesson_id": next_lesson_id, "message": "عاش! فتح الدرس اللي بعده 💪" if passed else "لسه محتاج تراجع المحتوى وتحاول تاني 🙏"}

@router.post("/generateAssessmentQuiz")
async def generate_assessment_quiz(data: dict = Body(...), session: Session = Depends(get_session), user_id: str = Depends(get_current_user_id)):
    """Mandatory 5-question placement quiz for non-beginners (onboarding).

    No persistence — the frontend blends the score into self-rated levels.
    """
    from ..services.llm import generate_assessment_quiz as _gen
    goal = (data.get("goal") or "").strip() or "general learning"
    skills = data.get("skills", []) or []
    lang = data.get("lang", "ar")

    def _valid(q):
        return (isinstance(q, dict) and q.get("question")
                and isinstance(q.get("options"), list) and len(q["options"]) == 4
                and isinstance(q.get("correct"), int) and 0 <= q["correct"] < 4)

    # The free model sometimes returns fewer than 5: top up with a 2nd call.
    seen, valid = set(), []
    for _ in range(2):
        if len(valid) >= 5:
            break
        res = await _gen(goal, skills, lang, 5)
        if isinstance(res, dict) and res.get("credit_exhausted"):
            return _credit_response()
        for q in (res.get("questions", []) if isinstance(res, dict) else []):
            key = (q.get("question") or "").strip().lower() if isinstance(q, dict) else ""
            if key and key not in seen and _valid(q):
                seen.add(key)
                valid.append(q)
            if len(valid) >= 5:
                break
    return {"questions": valid[:5]}

@router.post("/submitPhaseProject")
async def submit_phase_project(data: dict = Body(...), session: Session = Depends(get_session), user_id: str = Depends(get_current_user_id)):
    """Submit a stage project for AI mentor review.

    Approved (>=70): lesson completed + next phase unlocked (backend truth).
    Needs work: feedback returned, lesson stays open for retry.
    """
    from ..services.llm import review_project_agent
    lessonId = data.get("lessonId")
    submission_text = (data.get("submission_text") or "").strip()
    submission_url = (data.get("submission_url") or "").strip()
    lang = data.get("lang", "ar")
    lesson = session.get(Lesson, lessonId) if lessonId else None
    if not lesson or lesson.user_id != user_id:
        return _friendly_error()
    if not (lesson.node_id or "").startswith("stage_project_"):
        return _friendly_error()
    if not submission_text and not submission_url:
        return {"error": "temporary", "retry": False, "message": "Describe what you built or add a repo link first"}
    task = dict(lesson.task or {})
    brief = f"{task.get('title', '')}: {task.get('description', '')} Steps: {'; '.join(task.get('steps') or [])}"
    res = await review_project_agent(brief, submission_text, submission_url, lang)
    if isinstance(res, dict) and res.get("credit_exhausted"):
        return _credit_response()
    approved = int(res.get("score", 0) or 0) >= PASS_SCORE
    score = int(res.get("score", 0) or 0)
    task.update({
        "submission_text": submission_text,
        "submission_url": submission_url,
        "submitted_at": datetime.utcnow().isoformat(),
        "review": {
            "approved": approved,
            "score": score,
            "feedback": res.get("feedback", ""),
            "strengths": res.get("strengths", []) or [],
            "improvements": res.get("improvements", []) or [],
            "next_step": res.get("next_step", ""),
        },
    })
    lesson.task = task
    session.add(lesson)
    next_lesson_id = None
    if approved:
        lesson.status = "completed"
        lesson.quiz_passed = True
        lesson.quiz_score = score
        lesson.completed_date = datetime.utcnow().isoformat()[:10]
        session.add(lesson)
        from ..models import LessonProgress
        stmt = select(LessonProgress).where(LessonProgress.lesson_id == lessonId, LessonProgress.user_id == user_id)
        prog = session.exec(stmt).first()
        if not prog:
            prog = LessonProgress(lesson_id=lessonId, user_id=user_id)
        prog.attempts = (prog.attempts or 0) + 1
        prog.quiz_score = score
        prog.status = "completed"
        prog.completed_at = datetime.utcnow()
        session.add(prog)
        next_lesson_id = _unlock_next_lesson(session, user_id, lesson.roadmap_id, lessonId)
    session.commit()
    session.refresh(lesson)
    return {
        "approved": approved,
        "score": score,
        "feedback": res.get("feedback", ""),
        "strengths": res.get("strengths", []) or [],
        "improvements": res.get("improvements", []) or [],
        "next_step": res.get("next_step", ""),
        "next_lesson_id": next_lesson_id,
        "message": "عاش! مشروعك اتقبل واتفتحت المرحلة اللي بعدها 💪" if approved else "كويس إنك حاولت — ظبّط ملاحظات المراجع وحاول تاني 🙏",
    }

@router.post("/getPublicPortfolio")
async def get_public_portfolio(data: dict = Body(...), session: Session = Depends(get_session), requester_id: str | None = Depends(get_optional_user_id)):
    # Public by design (shared portfolio links work without login).
    # Falls back to the requester's own id when userId is omitted.
    userId = data.get("userId") or requester_id
    if not userId:
        return {"cv": None, "projects": [], "user": None}
    from ..models import CV, Project, User
    stmt_cv = select(CV).where(CV.user_id == userId).order_by(CV.created_date.desc()).limit(1)
    cv = session.exec(stmt_cv).first()
    stmt_proj = select(Project).where(Project.user_id == userId).order_by(Project.created_date.desc())
    projects = session.exec(stmt_proj).all()
    owner = session.get(User, userId)
    return {
        "cv": cv.model_dump() if cv else None,
        "projects": [p.model_dump() for p in projects],
        "user": {"id": userId, "full_name": (cv.full_name if cv and cv.full_name else None) or (owner.full_name if owner else None) or (owner.email if owner else "ZEUS User")}
    }
