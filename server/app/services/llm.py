"""AI orchestration for discovery, planning, and execution using OpenAI and Gemini."""
import json
import os
import re
import asyncio

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))
    load_dotenv(".env")
except Exception:
    pass

ZEUS_SYSTEM = """You are ZEUS — a real AI Learning & Career Coach and close study friend. Talk like a real Egyptian friend: warm, simple, casual. Understand short replies like "ازيك", "تمام" like a friend.
COACH BEHAVIOR: Start naturally, never a fixed block of questions. Understand the user gradually: first ask where they want to get to (field/skill + why now), then pick ONE follow-up based on their last answer (goal, current level, experience, confusion/doubts, learning problems, past attempts, daily/weekly time + days, purpose: job/freelance/career-change/study/personal, deadline, learning format/video length). Never ask the user to name their own strengths or weaknesses; infer tentative learning strengths and gaps only from evidence in their answers and explain them as observations, not diagnoses. Never ask everything at once. Adapt dynamically — no fixed questionnaire.
After the conversation hold a clear User Profile (goal, current_level beginner/intermediate/advanced, experience, strengths, weaknesses, knowledge_gaps, interests, available_time hours+days, learning_preferences videos/reading/projects, career_goal, target_role, deadline) and build every plan from it. Respect level: beginner gets foundations first, advanced never sent back to basics.
LANGUAGE RULE: Arabic or English only. If the user writes Arabic (even with 2-3 English technical words like Frontend, React, Backend, AI, Mobile) → reply in Egyptian Arabic (عامية). If the user writes mostly English → reply in English. Never reply in any other language. Never say "as an AI".
IDENTITY SECRECY (absolute): You are Zeus, a learning companion inside the ZEUS app. NEVER mention how you work technically: no model names (ChatGPT, GPT, Gemini, Llama, Muse, AI model names of any kind), no API/provider/company names, no words like API/prompt/model/parameters/training. If asked who made you, where you come from, or what powers you, answer warmly and briefly: you are Zeus, صديقك في رحلة التعلم داخل تطبيق ZEUS (or the English equivalent) — then continue the conversation naturally. Never confirm or deny any specific technology."""

# Markers of prompt/instruction echo: if a reply contains these, the model
# echoed our own instructions instead of answering — NEVER show it to users.
_LEAK_MARKERS = (
    "json object with keys", "respond only with", "respond with valid json",
    "schema hint", "=== user said", "user said (respond", "next dimension",
    "coach rules", "reply language", "=== progress", "user learning context",
    "field_comparison", "iscomplete", "never reply in any other language",
)


def _looks_like_leak(text: str) -> bool:
    """True when text looks like echoed prompt instructions, not a real reply."""
    return any(m in (text or "").lower() for m in _LEAK_MARKERS)

REQUIRED_DIMS = ["field", "preferences", "video_length", "time", "education", "purpose"]


def is_broad_ai_goal(goal: str) -> bool:
    text = (goal or "").casefold()
    broad = bool(re.search(r"\bai\b|artificial intelligence|الذكاء الاصطناعي|الذكاء الاصطناعى|ذكاء اصطناعي", text))
    focused = bool(re.search(
        r"\b(computer vision|cv engineer|machine learning engineer|ml engineer|machine learning|data science|nlp|llm|natural language processing)\b"
        r"|الرؤية الحاسوبية|رؤية الكمبيوتر|تعلم الآلة|التعلم الآلي|علم البيانات|معالجة اللغة|معالجة اللغات",
        text,
    ))
    return broad and not focused


def _is_empty_val(v) -> bool:
    """Empty, or a placeholder word the LLM uses instead of admitting unknown."""
    if v in (None, "", [], {}):
        return True
    if isinstance(v, str) and v.strip().lower() in ("unknown", "none", "n/a", "null", "unspecified", "-"):
        return True
    return False


def _has_val(profile: dict, *keys) -> bool:
    """True when any of the keys holds a real persisted value (structured, not keywords)."""
    for k in keys:
        if not _is_empty_val((profile or {}).get(k)):
            return True
    return False


def _analyze_missing(profile: dict, history: str) -> list:
    """Coverage from STRUCTURED persisted values — never keyword presence.

    A dimension counts as covered only when its answer is actually saved in
    the profile, so the user is never re-asked something they answered.
    """
    profile = profile or {}
    missing = []
    if not _has_val(profile, "goal"):
        missing.append("field")
    if not _has_val(profile, "learning_style"):
        missing.append("preferences")
    if not _has_val(profile, "video_length_preference"):
        missing.append("video_length")
    if not (_has_val(profile, "weekly_hours") and _has_val(profile, "available_days")):
        missing.append("time")
    if not _has_val(profile, "education"):
        missing.append("education")
    if not _has_val(profile, "motivation", "career_intent"):
        missing.append("purpose")
    return missing

DIM_ORDER = ["field", "preferences", "video_length", "time", "education", "purpose"]


def _wants_plan_now(text: str) -> bool:
    text = (text or "").strip().lower()
    return bool(re.search(
        r"اعمل\s*(?:لي|لنا|بس)?\s*خطة|اعملي\s*خطة|ابدأ(?:\s*(?:الخطة|بقى|يلا))?|"
        r"يلا\s*(?:ابدأ|نبدأ|اعمل)|خلاص\s*(?:ابدأ|كفاية|اعمل)|كفاية\s*أسئلة|"
        r"يا\s*عم\s*انجز|انجز|خلص(?:نا)?|بلاش\s*أسئلة|مش\s*عايز\s*أسئلة|"
        r"start\s*(?:the\s*)?plan|make\s*(?:me\s*)?a\s*plan|let'?s\s*start|"
        r"that'?s\s*enough\s*questions|hurry\s*up|let'?s\s*get\s*to\s*it",
        text,
    ))


def _discovery_summary(profile: dict, lang: str) -> str:
    goal = str(profile.get("goal") or "").strip()
    level = str(profile.get("current_level") or "").lower()
    level_text = ("from scratch" if level in ("beginner", "مبتدئ") else "at your current level") if lang == "en" else (
        "من الصفر" if level in ("beginner", "مبتدئ") else "على مستواك الحالي"
    )
    hours = profile.get("weekly_hours")
    time_text = f"{hours} ساعات أسبوعيًا" if hours is not None else "على وقتك المتاح"
    purpose = str(profile.get("career_intent") or profile.get("career_goal") or profile.get("motivation") or "").strip()
    role = str(profile.get("current_role") or "").strip()
    if lang == "en":
        details = [goal, role, level_text, time_text, purpose]
        details = [item for item in details if item]
        return f"Got it — I have the essentials ({'; '.join(details)}). I’ll move on and build your plan; we can discover strengths and gaps through the exercises."
    details = [item for item in (goal, role, level_text, time_text, purpose) if item]
    return f"تمام، جمعت الأساسيات: {'، '.join(details)}. هبدأ أجهز خطتك، ونكتشف نقاط قوتك والفجوات من التمارين بدل ما نخمنها."

# NOTE: No canned questions by design — every question comes from the LLM.
# _fallback_question and DIM_QUESTIONS_* were permanently removed; on LLM
# failure the agent retries once, then returns an honest retryable error.

_AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

_DAY_ALIASES = {
    "saturday": ["السبت", "سبت", "saturday", "sat"],
    "sunday": ["الأحد", "الاحد", "أحد", "احد", "sunday", "sun"],
    "monday": ["الاثنين", "الاثنين", "اتنين", "التنين", "monday", "mon"],
    "tuesday": ["الثلاثاء", "التلات", "تلات", "tuesday", "tue"],
    "wednesday": ["الأربعاء", "الاربع", "اربع", "wednesday", "wed"],
    "thursday": ["الخميس", "خميس", "thursday", "thu"],
    "friday": ["الجمعة", "الجمعه", "جمعة", "جمعه", "friday", "fri"],
}
_ALL_DAYS = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"]


def _norm_digits(text: str) -> str:
    return (text or "").translate(_AR_DIGITS)


def _user_lines(history: str) -> list:
    """User messages oldest→newest. Corrections live in later messages, so
    deterministic parsing takes the LAST stated value, not the first."""
    return [l[len("user:"):] for l in (history or "").split("\n") if l.startswith("user:")]


def _parse_weekly_hours(history: str):
    """Deterministic hours extraction: digits + hour words, per-day or per-week.
    Latest mention wins (user corrections override earlier answers)."""
    found = None
    for line in _user_lines(history):
        t = _norm_digits(line).lower()
        if not t:
            continue
        v = None
        days_match = re.search(r"(\d+)\s*(?:يوم|أيام|ايام|days?)\s*(?:في|بال|per|a)?\s*(?:الأسبوع|الاسبوع|week)?", t)
        word_days = {"يومين": 2, "يومان": 2, "يوم واحد": 1, "one day": 1, "two days": 2}
        days_per_week = int(days_match.group(1)) if days_match else next(
            (count for phrase, count in word_days.items() if phrase in t), None
        )
        m = re.search(
            r"(ساعتين|(\d+(?:\.\d+)?))\s*(?:ساع\w*|hours?|hrs?)\s*"
            r"(في\s*اليوم|يوميا|يومي|a\s*day|daily|per\s*day|كل\s*يوم)",
            t,
        )
        if m:
            n = 2.0 if "ساعتين" in (m.group(1) or "") else float(m.group(2))
            v = round(n * (days_per_week or 7), 1)
        else:
            m2 = re.search(r"(\d+(?:\.\d+)?)\s*(ساع\w*|hour\w*|hrs?)", t)
            if m2:
                try:
                    v = float(m2.group(1))
                except Exception:
                    v = None
            elif "ساعتين" in t:
                v = 14.0 if any(k in t for k in ["يوم", "يومي", "day", "daily"]) else 2.0
            elif re.search(r"ساعة\s*(واحدة|واحده)", t):
                v = 1.0
        if v is not None:
            found = v
    return found


def _parse_available_days(history: str):
    """Deterministic day extraction. Latest day-mentioning message wins, so a
    correction ("لأ، الأحد بس") replaces earlier days instead of merging."""
    found = None
    for line in _user_lines(history):
        t = _norm_digits(line).lower()
        if not t:
            continue
        if any(k in t for k in ["كل يوم", "طول الأسبوع", "طول الاسبوع", "يوميا", "يومياً", "every day", "daily", "all week", "7 أيام", "٧ ايام", "كل الايام"]):
            found = list(_ALL_DAYS)
            continue
        if any(k in t for k in ["weekdays", "أيام الأسبوع", "ايام الاسبوع", "أيام العمل"]):
            found = ["sunday", "monday", "tuesday", "wednesday", "thursday"]
            continue
        count_match = re.search(r"(\d+)\s*(?:يوم|أيام|ايام|days?)", t)
        count_words = {"يومين": 2, "يومان": 2, "يوم واحد": 1, "one day": 1, "two days": 2}
        days_count = int(count_match.group(1)) if count_match else next(
            (count for phrase, count in count_words.items() if phrase in t), None
        )
        if days_count is not None and any(word in t for word in ["اسبوع", "أسبوع", "week"]):
            found = [f"{days_count} days/week"]
            continue
        days = [day for day, aliases in _DAY_ALIASES.items() if any(a in t for a in aliases)]
        # "الاتنين مع بعض" means "both (styles)" in Egyptian Arabic, not Monday
        if "مع بعض" in t and "monday" in days:
            days = [d for d in days if d != "monday"]
        # Bare "الاتنين/اتنين" is AMBIGUOUS: it means "both styles" unless the
        # line is clearly about days/schedule. Never invent a Monday from it.
        if days == ["monday"]:
            monday_only_via_etneen = any(a in t for a in ["الاتنين", "الاثنين", "اتنين", "التنين"])
            day_context = any(k in t for k in ["يوم", "ايام", "أيام", "اسبوع", "أسبوع", "فاضي", "فاضية", "متاح", "متاحة", "جدول", "days", "week", "available", "free"])
            if monday_only_via_etneen and not day_context:
                days = []
        if days:
            found = [d for d in _ALL_DAYS if d in days]
    return found


def _parse_enum(history: str):
    """Deterministic style/level/depth extraction. Latest mention wins."""
    out = {}
    history_lines = (history or "").split("\n")
    for line_index, line in enumerate(history_lines):
        if not line.startswith("user:"):
            continue
        t = (line or "").lower()
        previous_assistant = next(
            (prior[len("assistant:"):].lower() for prior in reversed(history_lines[:line_index]) if prior.startswith("assistant:")),
            "",
        )
        video_length_question_pending = (
            any(word in previous_assistant for word in ["video", "videos", "فيديو"])
            and any(word in previous_assistant for word in ["short", "قصير", "قصيرة"])
            and any(word in previous_assistant for word in ["long", "طويل", "طويلة"])
        )
        _day_ctx = any(k in t for k in ["يوم", "ايام", "أيام", "اسبوع", "أسبوع", "فاضي", "فاضية", "متاح", "جدول",
                                        "السبت", "الأحد", "الاحد", "الثلاثاء", "التلات", "الأربعاء", "الخميس", "الجمعة", "الجمعه",
                                        "saturday", "sunday", "tuesday", "wednesday", "thursday", "friday", "days", "week"])
        _bare_etneen = any(k in t for k in ["الاتنين", "الاثنين", "اتنين", "التنين"])
        if not video_length_question_pending:
            if any(k in t for k in ["الاثنين مع بعض", "الاتنين مع بعض", "مختلط", "both", "mixed", "فيديو وقراءة", "قراءة وفيديو"]):
                out["learning_style"] = "mixed"
            elif _bare_etneen and not _day_ctx:
                # Bare "both" answering a style question — never a Monday here.
                out["learning_style"] = "mixed"
            elif any(k in t for k in ["فيديو", "فيديوهات", "مرئي", "video", "videos", "يوتيوب", "youtube"]):
                out["learning_style"] = "video"
            elif any(k in t for k in ["قراءة", "مقالات", "كتب", "اقرأ", "reading", "articles", "books", "docs"]):
                out["learning_style"] = "reading"
            elif any(k in t for k in ["عملي", "تطبيق", "مشاريع", "بإيدي", "hands", "practice", "practical", "projects"]):
                out["learning_style"] = "hands_on"
        if any(k in t for k in ["فيديو قصير", "فيديوهات قصيرة", "الفيديو القصير", "الفيديوهات القصيرة", "فيديوهات مختصرة", "الفيديوهات المختصرة", "short video", "short videos", "short-form"]):
            out["video_length_preference"] = "short"
        elif any(k in t for k in ["فيديو طويل", "فيديوهات طويلة", "الفيديو الطويل", "الفيديوهات الطويلة", "شرح طويل", "شرح مفصل طويل", "long video", "long videos", "long-form"]):
            out["video_length_preference"] = "long"
        elif (
            len(t.split()) <= 4
            and not any(k in t for k in ["hour", "hours", "hrs", "ساع", "day", "days", "يوم", "week", "اسبوع", "أسبوع", "term"])
            and any(k in t for k in ["short", "قصير", "قصيرة", "قصيره"])
        ):
            out["video_length_preference"] = "short"
        elif (
            len(t.split()) <= 4
            and not any(k in t for k in ["hour", "hours", "hrs", "ساع", "day", "days", "يوم", "week", "اسبوع", "أسبوع", "term"])
            and any(k in t for k in ["long", "طويل", "طويلة", "طويله"])
        ):
            out["video_length_preference"] = "long"
        elif any(k in t for k in ["مش فارقة المدة", "أي مدة", "اي مدة", "المدة مش مهمة", "no preference", "any length", "either length"]):
            out["video_length_preference"] = "mixed"
        elif video_length_question_pending and any(k in t for k in ["mix", "mixed", "both", "depends", "depending", "مزيج", "مختلط", "حسب الموضوع", "الاتنين", "الاثنين"]):
            out["video_length_preference"] = "mixed"
        if any(k in t for k in ["مبتدئ", "مبتدي", "مبتدئة", "مبتديه", "لسه ببدأ", "من الصفر", "صفر", "جديد", "beginner", "scratch", "from zero", "new to", "no experience", "just start"]):
            out["current_level"] = "beginner"
        elif any(k in t for k in ["متوسط", "شوية خبرة", "intermediate", "some experience"]):
            out["current_level"] = "intermediate"
        elif any(k in t for k in ["متقدم", "محترف", "خبير", "advanced", "expert", "experienced"]):
            out["current_level"] = "advanced"
        if any(k in t for k in ["تأسيس", "أساس", "basics", "fundamentals", "نظرة عامة", "overview", "من البداية"]):
            out["depth"] = "overview"
        elif any(k in t for k in ["متوازن", "balanced"]):
            out["depth"] = "balanced"
        elif any(k in t for k in ["تعمق", "تعمّق", "عميق", "deep", "advanced topics"]):
            out["depth"] = "deep"
    return out

def _extract_facts(history: str) -> dict:
    """Lightweight facts from our own conversation text (no user-phrase dictionary)."""
    t = (history or "").lower()
    facts = {"likes": [], "dislikes": [], "obstacles": []}
    # Negative sentiment markers (generic, both languages)
    neg = ["ممل", "مملة", "بكره", "مش بحب", "لا أحب", "boring", "hate", "don't like", "dont like", "dislike", "مملين"]
    pos = ["بحب", "ممتع", "ممتعة", "بحب", "love", "like", "enjoy", "ممتاز"]
    # Obstacle markers
    obs = ["معطل", "مشكلة", "صعوبة", "بتشتت", "تشتت", "مش لاقي وقت", "problem", "struggle", "difficult", "stuck", "بعاني"]
    if any(k in t for k in neg):
        facts["dislikes"].append("mentioned-negative")
    if any(k in t for k in pos):
        facts["likes"].append("mentioned-positive")
    if any(k in t for k in obs):
        facts["obstacles"].append("mentioned-obstacle")
    # Keep raw last user lines for the model to interpret precisely
    lines = [l for l in (history or "").split("\n") if l.startswith("user:")]
    facts["last_user_said"] = lines[-2:] if lines else []
    return facts


def _is_question(text: str) -> bool:
    """Detect if user message is a question to the bot (either language)."""
    if not text:
        return False
    t = text.strip()
    if "?" in t or "؟" in t:
        return True
    q_words = [
        "ما ", "ماذا", "ايه", "إيه", "هل ", "ليه", "ازاي", "إزاي", "what", "why",
        "how", "when", "where", "which", "do you", "can you", "ما الفوائد", "فايدة",
        "قارن", "وضح", "وضّح", "وضضح", "اشرح", "فهمني", "مش فاهم", "مش فاهمة", "ايه الفرق", "الفرق",
        "tell me", "explain", "compare", "clarify", "i don't understand", "i dont understand",
        "محتار", "محتارة", "مش عارف اختار", "مش عارف أختار", "مش عارفة اختار", "not sure", "unsure",
    ]
    return any(t.lower().startswith(w) or f" {w} " in f" {t.lower()} " for w in q_words)

PROFILE_KEYS = ["goal", "current_level", "learning_style", "preferred_language",
                "weekly_hours", "available_days", "education", "experience",
                "background", "motivation", "career_intent", "current_role", "stop_triggers", "depth",
                "obstacles", "video_preference", "video_length_preference", "known_skills", "target_skills",
                "strengths", "preferred_time", "deadline"]

RESERVED_KEYS = {"id", "user_id", "onboarding_step", "status", "created_date",
                 "updated_date", "created_by_id", "goal_recommendations", "skill_graph"}


def _merge_discovery_profile(base: dict, llm_patch: dict, history: str, eff_lang: str) -> dict:
    """Accumulate a rich profile across turns.

    Layers (each only fills, never invents free text):
    1. everything known so far (base),
    2. deterministic parsers over the FULL history (hours/days/style/level/
       depth/video preference — immune to LLM flakiness),
    3. fresh LLM values win when non-empty (it reads nuance best).
    """
    merged = {k: v for k, v in (base or {}).items() if k not in RESERVED_KEYS}
    try:
        det = _parse_enum(history)
        hours = _parse_weekly_hours(history)
        if hours is not None:
            det["weekly_hours"] = hours
        days = _parse_available_days(history)
        if days:
            det["available_days"] = days
        for k, v in det.items():
            if _is_empty_val(merged.get(k)) and not _is_empty_val(v):
                merged[k] = v
    except Exception:
        pass
    llm_patch = dict(llm_patch or {})
    # A comparison is exploratory: do not commit one of its options as the
    # learner's goal until they explicitly choose it in a later turn.
    for k, v in llm_patch.items():
        if k in RESERVED_KEYS:
            continue
        if _is_empty_val(v):
            continue
        merged[k] = v
    explicit = _extract_explicit_discovery_facts(history)
    merged.update(explicit)
    merged["preferred_language"] = merged.get("preferred_language") or eff_lang
    return merged


def _extract_explicit_discovery_facts(history: str) -> dict:
    """Capture clear field choices and job targets from user turns."""
    facts = {}
    for line in _user_lines(history):
        text = (line or "").strip().lower()
        if not text:
            continue

        data_analysis = bool(re.search(
            r"تحليل\s*(?:ال)?بيانات|داتا\s*أناليس(?:س|يز)|data\s*anal(?:ysis|ytics)",
            text,
        ))
        web_development = bool(re.search(
            r"(?:تطوير|برمجة)\s*(?:ال)?ويب|الويب|web\s*dev(?:elopment)?",
            text,
        ))
        undecided = bool(re.search(r"محتار|محتارة|بين|ولا|or\b|undecided|not sure", text))
        explicit_choice = bool(re.search(
            r"\bبس\b|فقط|اختار|اخترت|هختار|عايز(?:ة)?\s*(?:مجال|اتعلم|أتعلم)?|"
            r"هدفي|مجال(?:ي)?\s*(?:هو|اللي)|only|just|choose|chose|i want",
            text,
        ))
        if data_analysis and not (web_development and undecided) and (explicit_choice or len(text.split()) <= 5):
            facts["goal"] = "Data Analysis"
        elif web_development and not (data_analysis and undecided) and (explicit_choice or len(text.split()) <= 5):
            facts["goal"] = "Web Development"

        if (
            re.search(r"محلل(?:ة)?\s*(?:ال)?بيانات|data\s*analyst", text)
            and not undecided
            and (explicit_choice or len(text.split()) <= 5)
        ):
            facts["current_role"] = "Data Analyst"
            if re.match(r"^(?:اه|آه|أيوه|ايوه|نعم|yes|yeah)\b", text):
                facts["career_intent"] = "employment"
        clarify_only = any(term in text for term in ("يعني", "ايه", "إيه", "مش فاهم", "مش فاهمة", "what does", "what is"))
        if not clarify_only and not undecided and any(term in text for term in ("عن بعد", "عن بُعد", "ريموت", "remote", "work from home")):
            facts["career_intent"] = "remote work"
        elif not clarify_only and not undecided and any(term in text for term in ("فريلانس", "عمل حر", "freelance")):
            facts["career_intent"] = "freelancing"
        elif not clarify_only and not undecided and any(term in text for term in ("سفر", "الخارج", "برا مصر", "abroad", "travel")):
            facts["career_intent"] = "work abroad"
        elif any(term in text for term in (
            "عايز اشتغل", "عايزة اشتغل", "نفسي اشتغل", "هدفي اشتغل",
            "عشان اشتغل", "علشان اشتغل", "وظيفة بعد", "job", "career", "for work",
        )):
            facts["career_intent"] = "employment"

    user_messages = _user_lines(history)
    if user_messages:
        last_user = user_messages[-1].strip().lower()
        if last_user in {"اه", "آه", "أيوه", "ايوه", "نعم", "yes", "yeah", "yep"}:
            assistant_lines = [
                line[len("assistant:"):].strip().lower()
                for line in (history or "").split("\n")
                if line.startswith("assistant:")
            ]
            previous_assistant = assistant_lines[-1] if assistant_lines else ""
            if re.search(r"تتعلم.{0,35}(?:تشتغل|وظيف|شغل)|تعلم.{0,35}(?:تشتغل|وظيف|شغل)|learn.{0,35}(?:job|work|career)", previous_assistant):
                facts["career_intent"] = "employment"
    return facts


def _affirmative_plan_response(messages: list) -> bool:
    """Recognize a brief yes when it accepts an explicit offer to start learning."""
    if not messages:
        return False
    last_user_index = next(
        (index for index in range(len(messages) - 1, -1, -1) if messages[index].get("role") == "user"),
        None,
    )
    if last_user_index is None:
        return False
    answer = str(messages[last_user_index].get("content", "")).strip().lower()
    if answer not in {"اه", "آه", "أيوه", "ايوه", "نعم", "yes", "yeah", "yep", "تمام"}:
        return False
    previous_assistant = next(
        (str(message.get("content", "")).lower() for message in reversed(messages[:last_user_index]) if message.get("role") == "assistant"),
        "",
    )
    return bool(re.search(
        r"تبدأ.{0,30}(?:تعلم|التعلم)|نبدأ.{0,20}(?:التعلم|الخطة)|"
        r"ابدأ.{0,20}(?:الخطة|التعلم)|start learning|start the plan|begin learning",
        previous_assistant,
    ))


# Minimum structured DNA required before the bot may declare discovery done.
# (goal gets refined in the next step, so it is not required here.)
DNA_REQUIRED = ["goal", "learning_style", "video_length_preference", "weekly_hours", "available_days", "education", "career_intent"]


COACH_PROFILE_FIELDS = ["goal", "current_level", "experience", "strengths", "weaknesses", "education", "weekly_hours", "available_days", "learning_style", "career_intent", "current_role", "deadline", "obstacles", "stop_triggers"]

COACH_OPENER_AR = "أهلاً، أنا زيوس ☺️⚡️ احكيلي: محتار بين إيه، أو نفسك تتعلم إيه وتوصل لإيه؟"
COACH_OPENER_EN = "Hello, I'm ZEUS ☺️⚡️ Tell me: what are you unsure about, or what would you like to learn and achieve?"


def discovery_prompt(companionName: str, lang: str, profile: dict = None, history: str = "", next_dim: str = "", user_facts: dict = None) -> str:
    profile = profile or {}
    user_facts = user_facts or {}
    skip = ["onboarding_step","status","companion_name","created_date","updated_date","id","created_by_id","goal_recommendations","skill_graph"]
    known = "\n".join([f"- {k}: {json.dumps(v, ensure_ascii=False) if isinstance(v, (dict,list)) else v}" for k,v in profile.items() if k not in skip and v not in (None,"","null")])
    known_block = f"=== ALREADY KNOWN FROM PROFILE (NEVER re-ask) ===\n{known}\n" if known else "=== ALREADY KNOWN FROM PROFILE ===\nNothing yet — start fresh.\n"
    hist_known = ""
    if history:
        hist_known = f"\n=== CONVERSATION HISTORY (ALREADY ASKED - NEVER REPEAT SAME QUESTION) ===\n{history}\n"
    facts_block = ""
    if user_facts:
        facts_block = f"\n=== USER FACTS (collected so far - respect them, NEVER contradict) ===\n{json.dumps(user_facts, ensure_ascii=False)}\n- obstacles[] are PROBLEMS the user suffers from - never present them as advantages.\n- dislikes[] must never appear in options as positive choices.\n"
    if next_dim == "time" and _has_val(profile, "weekly_hours") and not _has_val(profile, "available_days"):
        time_instruction = "They already gave weekly hours. Ask only which days they can study."
    elif next_dim == "time" and _has_val(profile, "available_days") and not _has_val(profile, "weekly_hours"):
        time_instruction = "They already gave study days. Ask only how many hours per week they can realistically study."
    else:
        time_instruction = "Ask how many hours and which days per week they can realistically study. Save weekly_hours and available_days."
    next_questions = {
        "field": "Ask what field/skill or end goal they want to reach. If they are undecided, compare the fields they mentioned with concrete examples before asking them to choose.",
        "preferences": "Ask what they enjoy or dislike about studying, and what helps them learn (for example practice, reading, or videos). Save the preferred format in learning_style and specific study frustrations in stop_triggers or obstacles; do not invent or ask about strengths or weaknesses.",
        "video_length": "Ask whether they prefer short focused videos, long detailed explanations, or a mix; save video_length_preference as short, long, or mixed.",
        "time": time_instruction,
        "education": "Ask what school/college/university or educational stage they are in, what they study, and whether they have already tried learning this field. Keep it to one concise question.",
        "purpose": "Ask what they want this skill for: a local job, remote work, freelancing, travel/working abroad, study, or another goal. Save their own reason without assuming.",
    }
    next_instruction = next_questions.get(next_dim, "Summarize the learner's profile; do not ask another question.")
    next_block = f"\n=== NEXT DIMENSION (ask ONLY this one now): {next_dim} ===\n{next_instruction}\nIf the user is undecided between fields, compare those options first and ask them to choose; this temporarily overrides the next dimension. Do not save an undecided option as their chosen goal.\n" if next_dim else "\n=== NEXT DIMENSION: none left - summarize warmly and set isComplete=true ===\n"
    if lang == "en":
        return f"""You are ZEUS, an AI Learning & Career Coach and true friend. Name is {companionName} but don't say it unless needed. Reply ONLY in English. Languages allowed: English or Arabic only.

{known_block}{hist_known}{facts_block}{next_block}
=== COACH RULES (strict, in order) ===
1. FIRST MESSAGE: if history is empty, open naturally with: "{COACH_OPENER_EN}" — never a fixed block of direct questions.
1a. DISCOVERY IS SHORT AND ORDERED: after the learner chooses a field, ask only these five required topics, one question per turn, in this order: study likes/dislikes and helpful learning activities; short/long video preference; realistic weekly hours and days; current school/college/major and prior exposure to the field; why they want the skill (local job, remote work, freelancing, travel/abroad, or another goal). Use their answers to fill the profile, then finish discovery. Never re-ask a topic already answered. The field comparison happens before these questions if they are undecided.
2b. DISAMBIGUATION (critical): the word "both/الاتنين" is AMBIGUOUS — resolve it from the PENDING question, never in isolation. If the pending question was about learning STYLE (videos vs articles), it means BOTH styles: set learning_style=mixed and NEVER treat it as a day. Only treat it as a weekday when the conversation is about DAYS/schedule. Always echo your interpretation explicitly (e.g. "Got it, a mix of both") so the user can correct you.
2. ADAPTIVE AND QUICK: sound like a thoughtful human friend, not a form. Respond to one real detail in the user's answer, then ask ONE concise question about a genuinely missing core detail. Do not repeat their goal, ask why they want the field twice, or add side questions once their field, experience, purpose, time, and learning style are known. NEVER ask the user about their strengths or weaknesses. Instead, infer tentative strengths, weaknesses, and knowledge_gaps from specific evidence across their answers (for example, a stated learning preference, prior experience, or obstacle); populate those profile fields without interrupting the conversation, distinguish self-reported facts from observed evidence, and do not invent traits or diagnose personality. Keep replies under 35 words except a field comparison.
2c. When the user says to make/start the plan or that enough questions have been asked, do not ask anything else if their field, level, and study time are known. Briefly confirm and set isComplete=true.
2a. FIELD COMPARISON: when the user is unsure between fields or mentions multiple options, do NOT rush to the next profile question. Compare 2-3 relevant fields in a `field_comparison` array, tailored to what they said. Each item should include `field`, `description`, `difficulty`, `daily_tasks`, `job_titles`, `skills`, `tools`, `example_projects`, `growth_opportunities`, `pros`, `cons`, `specializations`, `workplaces`, `market_outlook`, and a specific `why_fits`. For AI, explain the practical difference between Machine Learning (data, features, training/evaluation), Computer Vision (image/video systems), and NLP/LLMs (language, search, assistants), including concrete things each role builds. Compare role availability and types of employers cautiously as general market guidance, never claim live research or guaranteed outcomes. Keep each card clear and concrete; explain what they learn, build, and do at work. Ask which direction attracts them most. Until they choose, keep all options unselected and do not save any as their goal. Once they choose, acknowledge the choice and resume one-question-at-a-time discovery.
2d. When asked to explain or compare, answer the actual question with concrete examples of typical daily work, tools, and a small project for each field; do not repeat a generic one-line summary. If the user says they like data, explain which data-related path best fits and why. Do not ask them to choose again after they explicitly chose a field.
2e. For Data Analysis vs Web Development, use a concrete small-business example: web development builds an online store where customers browse products, add to cart, pay, and send orders to the business/shipping company; data analysis takes a sales file, cleans missing/duplicate/inconsistent records, calculates profit and loss, finds best- and worst-performing products, and presents the results in charts/dashboard for business decisions. Explain what the learner actually builds and the tools involved. For Data Analysis vs Data Science, explain that science adds stronger statistics and predictive/modeling work on top of analysis. If the user says they like data, recommend starting with Data Analysis unless their answers show a stronger interest in building predictive models.
3. If the user's last message is a QUESTION to you (not an answer), answer it briefly in 1 sentence, then ask the ONE next question. Never ignore their question.
4. Understand meaning from context: "starting from zero / no experience" = beginner — set core skills to Beginner automatically, NEVER ask them to self-rate percentages. If precise level is needed, run a quiz assessment instead.
5. OPTIONS: only when choices genuinely help AND they match the reply topic AND they don't contradict USER FACTS. Omit otherwise.
6. isComplete=true ONLY when NEXT DIMENSION is none. Then give a warm 2-sentence summary, no options, and the durable profile fields: goal, current_level, experience, strengths, weaknesses, education, weekly_hours, available_days, learning_style, career_intent, current_role, motivation, deadline, obstacles, stop_triggers, video_preference, and video_length_preference. Use current_role for the target job, career_intent/motivation for why they are learning, and weekly_hours/available_days for available_time. Populate strengths/weaknesses only when supported by the conversation; phrase them as tentative observations and never ask the user to self-assess them.
7. TOTAL SECRECY: you are Zeus inside the ZEUS app. Never reveal any technical details (model/company/API names). If asked, reply warmly that you are Zeus, their learning companion, and continue naturally.
8. Be natural, not robotic: if the user corrects a previous answer, adopt the new value immediately and say so.
"""
    return f"""You are ZEUS, the user's true friend and companion. Name is {companionName} but don't say it unless needed. Reply ONLY in Egyptian Arabic (عامية). Languages allowed: Arabic or English only - never any other language.

 {known_block}{hist_known}{facts_block}{next_block}
=== RULES (strict, in order) ===
0. أول رسالة: لو لا يوجد history ابدأ طبيعياً بهذه الجملة فقط: "{COACH_OPENER_AR}" — ممنوع كتلة أسئلة ثابتة.
0أ. الاكتشاف قصير وبترتيب ثابت: بعد ما يختار المجال اسأله عن خمس نقاط فقط، سؤال واحد في كل مرة: إيه اللي بيحبه أو بيكرهه في المذاكرة وإيه الأنشطة اللي بتساعده يتعلم؛ يفضل فيديوهات قصيرة ولا شرح طويل؛ كام ساعة وأنهي أيام يقدر يذاكر أسبوعياً؛ هو في مدرسة/كلية/جامعة إيه ودرس المجال قبل كده ولا لأ؛ وعايز المهارة ليه (وظيفة محلية، شغل عن بُعد، عمل حر، سفر/شغل بالخارج، دراسة أو هدف تاني). سجّل الإجابات في البروفايل وبعدها خلّص الاكتشاف. ممنوع تكرر سؤال اتجاوب، والمقارنة بين المجالات تحصل قبل الأسئلة دي لو لسه محتار.
1b. توضيح اللبس (مهم جداً): كلمة "الاتنين" غامضة — فسّرها من السؤال المعلق فقط، أبداً بمعزل عنه. لو السؤال المعلق عن ستايل التعلم (فيديو ولا مقالات) فمعناها الاتنين مع بعض: ثبّت learning_style=mixed وممنوع منعاً باتاً اعتبارها يوم الاثنين. اعتبرها يوماً فقط لو الكلام عن الأيام/الجدول. ولازم توضح فهمك صراحة في الرد (مثلاً: تمام، ميكس فيديو وقراءة 👍) عشان المستخدم يصححك لو غلط.
1. تكيّف سريع وطبيعي: اتكلم كصاحب مهتم بجد، مش استمارة. التقط تفصيلة حقيقية من آخر إجابة ورد عليها باختصار، وبعدها اسأل سؤال واحد عن معلومة أساسية ناقصة فعلًا. ممنوع تكرر الهدف أو تسأل عن سبب التعلم مرتين أو تفتح أسئلة جانبية بعد معرفة المجال والخبرة والهدف والوقت وأسلوب التعلم. ممنوع تمامًا تسأل المستخدم عن نقاط قوته أو ضعفه؛ استنتج نقاط القوة والضعف والفجوات المعرفية بشكل مبدئي من أدلة واضحة في إجاباته (مثل تفضيل تعليمي ذكره أو تجربة أو عائق حكاه)، وحدّث حقول `strengths`, `weaknesses`, `knowledge_gaps` في البروفايل من غير ما تقطع المحادثة. فرّق بين كلام المستخدم والاستنتاج، وما تخترعش صفات أو تقدمها كتشخيص. الرد أقل من ٣٥ كلمة إلا في مقارنة المجالات.
1ج. لو المستخدم قال اعمل/ابدأ الخطة أو كفاية أسئلة، ما تسألش سؤال جديد لو المجال والمستوى والوقت معروفين؛ أكد باختصار وخلّي isComplete=true.
1أ. مقارنة المجالات: لو المستخدم محتار بين مجالات أو ذكر أكتر من اختيار، ما تستعجلش للسؤال التالي في البروفايل. اعمل مقارنة مناسبة بين مجالين أو ٣ في `field_comparison` ومخصصة لاهتماماته. كل عنصر يحتوي `field`, `description`, `difficulty`, `daily_tasks`, `job_titles`, `skills`, `tools`, `example_projects`, `growth_opportunities`, `pros`, `cons`, `specializations`, `workplaces`, `market_outlook`، و`why_fits`. في الذكاء الاصطناعي اشرح الفرق العملي بين Machine Learning (بيانات وخصائص وتدريب وتقييم)، وComputer Vision (أنظمة الصور والفيديو)، وNLP/LLMs (اللغة والبحث والمساعدات)، مع أمثلة لحاجات كل وظيفة بتبنيها. وضّح انتشار الأدوار وأنواع الشركات بحذر كمعلومات عامة، من غير ادعاء بحث لحظي أو ضمان وظيفة. اشرح هيتعلم إيه ويبني إيه ويعمل إيه في الشغل. اسأله أنهي اتجاه جذبه أكتر. لحد ما يختار، ما تسجلش أي اختيار كهدف مؤكد. بعد ما يختار، أكد اختياره وكمل سؤال واحد في كل مرة.
1د. لو طلب شرح أو مقارنة، جاوب على سؤاله بأمثلة واضحة من الشغل اليومي والأدوات ومشروع بسيط لكل مجال؛ ممنوع تكرار ملخص عام من سطر واحد. لو قال إنه بيحب البيانات، وضح له أنهي مسار بيانات أقرب له وليه. ما تطلبش منه يختار تاني بعد ما يحدد مجال صراحة. لو حدد وظيفة مستهدفة (مثل محلل بيانات)، سجّلها في current_role ولا تسأله مرة أخرى هل يريد العمل في المجال أو ما الوظيفة التي يريدها؛ اسأل فقط عن سبب/نوع هدفه المهني إذا لم يُذكر بوضوح، أو انتقل للسؤال الأساسي التالي.
1هـ. لو المقارنة بين تحليل البيانات وتطوير الويب استخدم مثال شركة تجارة: مطور الويب يبني متجر إلكتروني العميل يتصفح فيه المنتجات ويضيفها للسلة ويدفع، والطلبات توصل للشركة وشركة الشحن؛ محلل البيانات ياخد ملف المبيعات وينظف القيم الناقصة والمكررة وغير المتسقة، ويحسب الربح والخسارة ويحدد المنتجات الرابحة والخاسرة ويعرض النتائج في رسوم أو Dashboard تساعد الشركة تاخد قرار. وضح الأدوات والحاجات اللي المتعلم هيبنيها فعلياً. ولو المقارنة بين تحليل البيانات وعلوم البيانات، اشرح إن علوم البيانات بتضيف إحصاء أقوى وتنبؤ/نمذجة فوق التحليل. لو قال إنه بيحب البيانات، رشح يبدأ بتحليل البيانات إلا لو إجاباته وضحت إنه مهتم أكتر ببناء نماذج تنبؤية.
2. لو آخر رسالة من المستخدم سؤال لك (مش إجابة)، جاوبه باختصار في سطر واحد، وبعدها اسأل سؤالاً واحداً فقط. لا تتجاهل سؤاله أبداً.
3. افهم المعنى من السياق وليس اللفظ. أي صياغة تعني "ببدأ من الصفر / معنديش خبرة" = مبتدئ — ثبّت المهارات الأساسية Beginner تلقائياً، وممنوع تطلب منه تقييم نفسه بنسب مئوية. لو محتاج دقة اعمل Quiz تقييم حقيقي.
4. OPTIONS: فقط عند الحاجة الحقيقية، ويجب أن تطابق موضوع الرد، وألا تتعارض مع USER FACTS (مثلاً لو يكره الكورسات المملة لا تقترح دورات كخيار ممتع).
5. obstacles[] مشاكل يعاني منها — لا تعرضها أبداً كميزات.
6. isComplete=true فقط عندما لا يوجد NEXT DIMENSION. وقتها لخص بود في جملتين بدون options مع حقول البروفايل المحفوظة: goal, current_level, experience, strengths, weaknesses, education, weekly_hours, available_days, learning_style, career_intent, current_role, motivation, deadline, obstacles, stop_triggers, video_preference, video_length_preference. استخدم current_role للوظيفة المستهدفة، وcareer_intent/motivation لسبب التعلم، وweekly_hours/available_days للوقت المتاح. املأ نقاط القوة أو الجوانب التي تحتاج تقوية فقط لو عليها دليل من المحادثة، كملاحظات مبدئية؛ وممنوع تسأل المستخدم عنها.
7. سريّة تامة: أنت Zeus داخل تطبيق ZEUS. ممنوع منعاً باتاً ذكر أي تفاصيل تقنية (أسماء موديلات/شركات/APIs). لو سُئلت عنها رد بود: أنا Zeus صديقك في رحلة التعلم، وكمل المحادثة.
8. كن طبيعياً لا آلياً: لو المستخدم صحح إجابة سابقة اعتمد الجديدة فوراً ووضح ذلك.
"""

def roadmap_prompt(profile: dict, goal: str, lang: str, base_nodes: list = None, market_research: dict = None) -> str:
    lang_txt = "Egyptian Arabic" if lang == "ar" else "English"
    base = ""
    if base_nodes:
        base = f"\nCURRICULUM FOUNDATIONS (review and heavily customize for this user):\n{json.dumps(base_nodes, ensure_ascii=False)}\n"
    market = ""
    if market_research:
        market = (
            "\nCURRENT JOB-MARKET RESEARCH (use this to prioritize the curriculum; distinguish observed requirements from general advice):\n"
            f"{json.dumps(market_research, ensure_ascii=False)}\n"
        )
    
    level = (profile or {}).get("current_level", "beginner")
    weekly_hours = (profile or {}).get("weekly_hours", 10)
    video_length = (profile or {}).get("video_length_preference") or "mixed"
    known = list((profile or {}).get("known_skills", []) or [])
    for item in (profile or {}).get("skill_graph", []) or []:
        if isinstance(item, dict) and item.get("skill") and (item.get("level") or 0) >= 70 and item["skill"] not in known:
            known.append(item["skill"])
    style = (profile or {}).get("learning_style", "mixed")
    education = (profile or {}).get("education", "")
    data_analysis_goal = bool(re.search(
        r"data\s*anal(?:ysis|ytics|yst)|تحليل\s*(?:ال)?بيانات|داتا\s*أناليس",
        " ".join(str(value or "") for value in (
            goal,
            (profile or {}).get("target_role"),
            (profile or {}).get("current_role"),
        )),
        flags=re.IGNORECASE,
    ))
    goal_specific = ""
    if data_analysis_goal:
        goal_specific = """\nDATA ANALYSIS CURRICULUM (apply when this is the learner's goal):
- For a beginner, set every unverified starting skill to zero and start with practical foundations; do not assume they already know spreadsheets, programming, or statistics.
- Treat Data Analyst as a full job-role path, not a single short topic. Build enough distinct lessons to teach and practice spreadsheet analysis (Excel/Google Sheets), practical arithmetic/percentages/averages and descriptive statistics, data quality and cleaning, SQL queries/joins/aggregations, analysis and business questions, charts and dashboards (Power BI or Tableau), and Python with pandas where useful. A typical complete beginner-to-job-ready scope is around 12-20 lessons across several phases, but adjust the actual structure to this learner, the evidence, and the skill coverage rather than targeting a fixed count.
- Keep dashboarding/data visualization, business interpretation/storytelling, and the final portfolio case study as explicit lesson outcomes; do not assume that Python analysis or spreadsheet exercises automatically cover them. A plan with fewer than about 12 distinct lessons for a beginner targeting this job is usually too compressed unless every core competency still receives its own clear instruction and practice.
- Teach math through real analysis tasks rather than an abstract advanced-math detour. Connect every technique to a realistic business question and explain how to interpret results.
- Include separate guided exercises for major skills and at least two progressively harder end-to-end portfolio projects using realistic sales/customer/operations datasets. The final case study should include a clean dataset, SQL or Python analysis, visualizations/dashboard, conclusions, and a clear written recommendation.
- Use the market research below to prioritize entry-level Data Analyst requirements; keep optional specializations separate from core prerequisites.
"""

    prof = profile or {}
    full_prof = json.dumps({k: v for k, v in prof.items() if v not in (None, "", [])}, ensure_ascii=False)[:3000]
    return f"""Build a REAL, personalized, job-market-ready phased learning roadmap for the goal: {goal}
USER PROFILE (build the plan FROM this — never a fixed template):
{full_prof}
- Target Goal: {goal}
- Current Level: {level} (CRITICAL: beginner=foundations first e.g. for AI: Python → Math/Stats → Data → ML → DL → CV/NLP → Transformers → LLMs/GenAI → Deployment → Projects. intermediate=skip basics, start at architecture/state/async. advanced=scalability/perf/distributed/specialization only.)
- Known Skills: {json.dumps(known, ensure_ascii=False)} (Do NOT repeat what they already know; do NOT send advanced back to basics; do NOT throw beginners into Transformers)
- Background: {education} | Time: {weekly_hours}h/week | Style: {style} | Video: {prof.get('video_preference', 'free')}
{base}
{market}
{goal_specific}
STRICT REQUIREMENTS:
1. JOB-READY AND EVIDENCE-LED: use current role requirements in the market research when provided; identify must-have skills versus specialization/nice-to-have. Include every researched must-have skill explicitly in at least one lesson's skills, objective, or tasks; do not silently omit a requirement. Never claim a guaranteed job, salary, or live market fact without a source.
2. COMPLETE FIELD COVERAGE: when the target is a broad AI Engineer / "learn all AI" path (not a focused specialization like Computer Vision or NLP), build a true beginner-to-job-ready curriculum: Python and software foundations (Git, environment, CLI); math/statistics (linear algebra, probability, calculus essentials); NumPy/Pandas/data cleaning/visualization/SQL; classical ML (regression, classification, trees/ensembles, clustering, feature engineering, validation, metrics, tuning); deep learning and PyTorch; computer vision; NLP; transformers; LLM application engineering (embeddings, vector search, RAG, evaluation, safety); serving, APIs, Docker, cloud basics, MLOps/monitoring; and progressively stronger portfolio projects. Do not omit foundations or compress this into a handful of shallow topics. Explicitly teach the relevant working tools in the lesson skills/tasks/tools: Python environments, Git/GitHub, terminal, Jupyter/Colab, NumPy, pandas, SQL, scikit-learn, PyTorch, Hugging Face, experiment tracking, FastAPI, Docker, and one cloud platform where relevant. Teach a tool alongside the skill that uses it, not as a disconnected list.
3. DYNAMIC STRUCTURE: decide the appropriate number of phases and lessons from the breadth of {goal}, the researched must-have skills, the learner's current level, and the stated outcome. There is NO preset number of phases or lessons: a single-tool question may be concise, but a job-ready career/occupation goal must be a complete curriculum, not a short overview. Give each major prerequisite and core competency enough dedicated instruction and practice; broad career goals need proportionally more lessons. When a node would otherwise teach several distinct core competencies too briefly, split it into focused concept/practice lessons; do not compress a career curriculum into one lesson per tool. Put multiple related lessons in each phase, number phases consecutively from 1, and do not split or merge topics just to hit a count. Tailor duration to level and {weekly_hours}h/week.
4. LOGICAL PROGRESSION: foundations → guided practice → applied builds → evaluation → advanced topics. Every phase needs a concrete portfolio project or milestone; projects should combine only skills already taught.
5. REALISTIC ESTIMATES: each node is a teachable lesson with a content-specific title (never "Day 1"), a clear objective, 3 actionable tasks, 2-4 concrete skills, one buildable project or project milestone, and zero to two useful resources (resources are loaded on demand). Keep each node concise and the total response within the output budget; if a domain is broad, prioritize all must-have foundations and skills over optional specializations. Calibrate estimated_hours to {weekly_hours}h/week and do not repeat prerequisite content the learner already knows.
6. PERSONALIZE: honor level, known skills, target role, motivation, obstacles, available days/time, preferred style/language, free/mixed resource preference, and video length preference ({video_length}). When preference is mixed, vary video duration to fit the lesson: concise videos for introductory/single-concept lessons, longer walkthroughs for complex implementation/project lessons. Every node serves {goal}; no unrelated tech.
7. Output node shape: id, title, phase, phase_title, phase_objective, objective, skills[], tools[] (specific software/tools taught or practiced in this lesson; use [] when none), estimated_hours, tasks[3-5], projects[1-2], resources[1-3 objects with title/type/tier/url], parent_ids (use [] when there is no prerequisite). Include every field on every node; never omit an empty tools or parent_ids list. Lessons in a phase share a concise phase_title and phase_objective. Use distinct stable ids and valid prerequisite parent_ids. Keep titles and objectives readable in {lang_txt}.
Language: {lang_txt}.
"""


async def _research_career_market_openai(profile: dict, goal: str, lang: str) -> dict | None:
    """Search current hiring signals with OpenAI web search and retain its citations."""
    cfg = _get_runtime_settings()
    api_key = cfg.get("openai_api_key")
    if not api_key:
        return None
    region = (profile or {}).get("location") or (profile or {}).get("target_region") or "the learner's region or remote"
    role = (profile or {}).get("target_role") or (profile or {}).get("current_role") or goal
    prompt = f"""Research current job postings for {role}, aligned to the learning target {goal}, in {region}.
Return a concise synthesis, not job listings or generic career advice:
- 4-8 commonly required technical skills and prerequisite knowledge
- common job titles and realistic entry-level expectations
- distinguish frequently required skills from optional/specialized skills
- identify portfolio evidence commonly requested
Use only details supported by the search results. Do not invent salaries or guarantee employment.
Write descriptions in {"Egyptian Arabic" if lang == "ar" else "English"}.
Return JSON with keys: roles (string[]), required_skills (string[]), optional_skills (string[]), prerequisites (string[]), portfolio_signals (string[])."""
    try:
        import httpx

        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": cfg.get("openai_model") or "gpt-4o-mini",
                    "tools": [{"type": "web_search"}],
                    "input": f"Research current hiring requirements using web search. Do not fabricate findings.\n\n{prompt}",
                    "max_output_tokens": 1800,
                },
            )
        response.raise_for_status()
        data = response.json()
        text_parts = []
        sources = []
        for item in data.get("output", []):
            if item.get("type") != "message":
                continue
            for content in item.get("content", []):
                if content.get("type") != "output_text":
                    continue
                text_parts.append(content.get("text", ""))
                for annotation in content.get("annotations", []):
                    if annotation.get("type") == "url_citation" and str(annotation.get("url", "")).startswith("https://"):
                        sources.append({
                            "title": annotation.get("title", ""),
                            "url": annotation["url"],
                            "provider": "openai",
                        })
        text = "\n".join(text_parts).strip()
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            result = json.loads(match.group(0))
        else:
            result = json.loads(text)
        if (
            not isinstance(result, dict)
            or not sources
            or not isinstance(result.get("required_skills"), list)
            or not any(isinstance(skill, str) and skill.strip() for skill in result["required_skills"])
        ):
            return None
        return {
            **{key: result.get(key, []) for key in ("roles", "required_skills", "optional_skills", "prerequisites", "portfolio_signals")},
            "sources": sources[:8],
        }
    except Exception as exc:
        print(f"OpenAI career research failed ({type(exc).__name__})")
        return None


async def _research_career_market_gemini(profile: dict, goal: str, lang: str) -> dict | None:
    """Summarize current job requirements with Google Search grounding."""
    cfg = _get_runtime_settings()
    if not cfg.get("gemini_api_key"):
        return None
    region = (profile or {}).get("location") or (profile or {}).get("target_region") or "the learner's region or remote"
    role = (profile or {}).get("target_role") or goal
    prompt = f"""Research current job postings for {role}, aligned to the learning target {goal}, in {region}.
Return a concise synthesis, not job listings or generic career advice:
- 4-8 commonly required technical skills and prerequisite knowledge
- common job titles and realistic entry-level expectations
- distinguish frequently required skills from optional/specialized skills
- identify portfolio evidence commonly requested
Use only details supported by the search results. Do not invent salaries or guarantee employment.
Write descriptions in {"Egyptian Arabic" if lang == "ar" else "English"}.
Return JSON with keys: roles (string[]), required_skills (string[]), optional_skills (string[]), prerequisites (string[]), portfolio_signals (string[])."""
    schema = {
        "type": "object",
        "properties": {
            "roles": {"type": "array", "items": {"type": "string"}},
            "required_skills": {"type": "array", "items": {"type": "string"}},
            "optional_skills": {"type": "array", "items": {"type": "string"}},
            "prerequisites": {"type": "array", "items": {"type": "string"}},
            "portfolio_signals": {"type": "array", "items": {"type": "string"}},
        },
    }
    result = await _call_gemini_grounded(
        prompt,
        "Research current hiring requirements using Google Search. Do not fabricate findings.",
        schema,
        cfg["gemini_api_key"],
        cfg["gemini_model"],
    )
    if not isinstance(result, dict):
        return None
    sources = (result.get("_sources") or [])[:8]
    if (
        not sources
        or not isinstance(result.get("required_skills"), list)
        or not any(isinstance(skill, str) and skill.strip() for skill in result["required_skills"])
    ):
        return None
    return {
        **{key: result.get(key, []) for key in ("roles", "required_skills", "optional_skills", "prerequisites", "portfolio_signals")},
        "sources": [{**source, "provider": "gemini"} for source in sources],
    }


async def research_career_market(profile: dict, goal: str, lang: str) -> dict | None:
    """Combine independently grounded job research from configured providers."""
    results = await asyncio.gather(
        _research_career_market_gemini(profile, goal, lang),
        _research_career_market_openai(profile, goal, lang),
        return_exceptions=True,
    )
    research = []
    for provider, result in zip(("Gemini", "OpenAI"), results):
        if isinstance(result, Exception):
            print(f"{provider} career research failed ({type(result).__name__})")
        elif isinstance(result, dict):
            research.append(result)
    if not research:
        return None

    merged = {}
    for key in ("roles", "required_skills", "optional_skills", "prerequisites", "portfolio_signals"):
        values = []
        seen = set()
        for result in research:
            items = result.get(key, [])
            if isinstance(items, str):
                items = [items]
            if not isinstance(items, list):
                continue
            for value in items:
                if isinstance(value, str) and value.strip() and value.strip().casefold() not in seen:
                    seen.add(value.strip().casefold())
                    values.append(value.strip())
        # Bound hard requirements so two providers' lists cannot overwhelm a
        # focused roadmap or make validation fail on every generated draft.
        merged[key] = values[:8] if key == "required_skills" else values
    sources = []
    seen_urls = set()
    for result in research:
        for source in result.get("sources", []):
            url = source.get("url")
            if url and url not in seen_urls:
                seen_urls.add(url)
                sources.append(source)
    if not sources or not merged["required_skills"]:
        return None
    merged["sources"] = sources[:12]
    merged["research_providers"] = [name for name, result in zip(("Gemini", "OpenAI"), results) if isinstance(result, dict)]
    return merged

# ---------------- Core caller with free LLM chain ----------------

def _get_runtime_settings() -> dict:
    """Read API keys and model selections from the database, with env fallback."""
    _RETIRED_GEMINI = {"gemini-1.0-pro", "gemini-1.5-flash", "gemini-1.5-pro",
                       "gemini-2.0-flash"}
    _GEMINI_FALLBACK = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"

    def _fresh_gemini(configured: str) -> str:
        m = _gemini_model_name(configured)
        if not m or m in _RETIRED_GEMINI:
            return _GEMINI_FALLBACK
        return m
    try:
        from ..core.database import engine
        from sqlmodel import Session
        from ..models import AdminSetting
        with Session(engine) as session:
            s = session.get(AdminSetting, "default")
            if s:
                return {
                    "gemini_api_key": (s.gemini_api_key or "").strip() or (os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")).strip(),
                    "gemini_model": _fresh_gemini(s.gemini_model or "gemini-2.5-flash"),
                    "openai_api_key": (s.openai_api_key or "").strip() or os.getenv("OPENAI_API_KEY", "").strip(),
                    "openai_model": (s.openai_model or "gpt-4o-mini").strip(),
                }
    except Exception as exc:
        print(f"AI settings database read failed; using environment configuration ({type(exc).__name__})")
    return {
        "gemini_api_key": (os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")).strip(),
        "gemini_model": os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip(),
        "openai_api_key": os.getenv("OPENAI_API_KEY", "").strip(),
        "openai_model": os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip(),
    }


def _gemini_model_name(model: str = "") -> str:
    name = (model or "").strip()
    if name.startswith("models/"):
        name = name[len("models/"):]
    return name


async def _call_gemini_grounded(prompt: str, system: str, response_schema: dict = None, api_key: str = None, model: str = None) -> dict | None:
    """Gemini with Google Search grounding."""
    gemini_key = (api_key if api_key is not None else os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("GOOGLE_API_KEY", "").strip()).strip()
    if not gemini_key:
        return None
    try:
        import httpx
        gemini_model = _gemini_model_name(model or os.getenv("GEMINI_MODEL", "") or "gemini-2.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_key}"
        full_text = f"{system}\n\n{prompt}\n\nRespond ONLY with JSON, no markdown."
        if response_schema:
            full_text += f" Schema: {json.dumps(response_schema)}"
        body = {
            "contents": [{"role": "user", "parts": [{"text": full_text}]}],
            "generationConfig": {"temperature": 0.7},
            "tools": [{"google_search": {}}],
        }
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json=body)
            if r.status_code in (401, 403):
                print(f"Gemini authentication failed with HTTP {r.status_code}")
                return None
            if r.status_code == 429:
                # Free-tier per-minute quota: usually resets in seconds — wait
                # once, retry, and only then hand off. Genuine billing death is
                # surfaced only via explicit billing errors, never bare 429.
                try:
                    import asyncio
                    await asyncio.sleep(5)
                    r = await client.post(url, json=body)
                except Exception:
                    return None
                if r.status_code == 429:
                    print("Gemini 429 persists after backoff — handing off to next provider")
                    return None
            r.raise_for_status()
            data = r.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            grounding = data["candidates"][0].get("groundingMetadata", {})
            sources = [
                {"title": item.get("web", {}).get("title", ""), "url": item.get("web", {}).get("uri", "")}
                for item in grounding.get("groundingChunks", [])
                if item.get("web", {}).get("uri")
            ]
            text = re.sub(r"```json|```", "", text).strip()
            try:
                result = json.loads(text)
                if sources and isinstance(result, dict):
                    result["_sources"] = sources[:8]
                return result
            except:
                m = re.search(r"\{.*\}", text, re.DOTALL)
                if m:
                    try:
                        result = json.loads(m.group(0))
                        if sources and isinstance(result, dict):
                            result["_sources"] = sources[:8]
                        return result
                    except:
                        pass
                if response_schema or _looks_like_leak(text):
                    return None
                return {"reply": text[:2000]}
    except Exception as e:
        print(f"Gemini grounded request failed ({type(e).__name__})")
        return None


# Each task uses OpenAI first and Gemini as fallback, except roadmap generation,
# which intentionally remains OpenAI-only.
TASK_ROUTES = {
    "discovery": ["openai"],
    "planning": ["openai"],
    "tutor": ["openai", "gemini"],
    "companion": ["openai", "gemini"],
    "review": ["openai", "gemini"],
    "quiz": ["openai", "gemini"],
    "assessment": ["openai", "gemini"],
    "recommend": ["openai", "gemini"],
    "rewrite": ["openai", "gemini"],
    "greet": ["openai", "gemini"],
    "jobs": ["gemini", "openai"],
}
DEFAULT_ROUTE = ["openai", "gemini"]


async def _call_openai(prompt: str, system: str, response_schema: dict = None, model: str = "gpt-4o-mini", max_tokens: int = None, task: str = None, provider_override: str = None) -> dict:
    cfg = _get_runtime_settings()

    gemini_key = cfg.get("gemini_api_key", "")
    gemini_model = cfg.get("gemini_model", "gemini-2.5-flash")
    openai_key = cfg.get("openai_api_key", "")
    openai_model_cfg = cfg.get("openai_model", model)

    async def _try_openai():
        if not openai_key:
            return None
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(
                api_key=openai_key,
                timeout=20.0 if task == "discovery" else 90.0 if task == "planning" else 60.0,
                max_retries=0 if task in ("discovery", "planning") else 2,
            )
            messages = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
            configured_model = str(openai_model_cfg or model)
            token_limit = max_tokens or (1400 if task == "discovery" else 4096 if response_schema else 1024)
            kwargs = {"model": configured_model, "messages": messages}
            if configured_model.lower().startswith(("gpt-5", "o1", "o3", "o4")):
                kwargs["max_completion_tokens"] = token_limit
            else:
                kwargs["temperature"] = 0.5 if task == "discovery" else 0.7
                kwargs["max_tokens"] = token_limit
            if response_schema:
                kwargs["response_format"] = {"type": "json_object"}
                messages[1]["content"] += f"\n\nYou MUST respond with valid JSON matching: {json.dumps(response_schema, ensure_ascii=False)}. Respond ONLY with JSON."
            resp = await client.chat.completions.create(**kwargs)
            content = resp.choices[0].message.content
            try:
                return json.loads(content)
            except:
                try:
                    m = re.search(r"\{.*\}", content, re.DOTALL)
                    if m:
                        return json.loads(m.group(0))
                except:
                    pass
                if response_schema or _looks_like_leak(content or ""):
                    print(f"OpenAI unparseable/leak, trying next provider: {(content or '')[:200]}")
                    if task == "planning":
                        return {"error": "openai_invalid_response", "retry": True, "reply": ""}
                    return None
                return {"reply": content}
        except Exception as e:
            print(f"OpenAI request failed ({type(e).__name__})")
            if task == "planning":
                status_code = getattr(e, "status_code", None)
                error_code = str(getattr(e, "code", "") or "").lower()
                message = str(e).lower()
                if status_code in (401, 403) or "invalid_api_key" in error_code:
                    error = "openai_auth_failed"
                elif status_code == 429 and any(term in message for term in ("insufficient_quota", "billing", "credits")):
                    return {"credit_exhausted": True, "error": "credit_exhausted", "retry": False, "reply": ""}
                elif status_code == 429:
                    error = "openai_rate_limited"
                elif status_code == 404 or "model_not_found" in error_code:
                    error = "openai_model_unavailable"
                elif "timeout" in type(e).__name__.lower():
                    error = "openai_timeout"
                else:
                    error = "openai_request_failed"
                return {"error": error, "retry": True, "reply": ""}
            return None

    async def _route(name: str):
        if name == "gemini":
            return await _call_gemini_grounded(prompt, system, response_schema, gemini_key, gemini_model)
        if name == "openai":
            return await _try_openai()
        return None

    if provider_override:
        try:
            return await _route(provider_override) or {"error": "provider_unavailable", "retry": True, "reply": ""}
        except Exception as e:
            print(f"AI provider connection test failed for {provider_override} ({type(e).__name__})")
            return {"error": "provider_unavailable", "retry": True, "reply": ""}

    if task == "discovery":
        if not openai_key:
            return {"error": "openai_not_configured", "retry": True, "reply": ""}
        try:
            return await _route("openai") or {"error": "openai_unavailable", "retry": True, "reply": ""}
        except Exception as e:
            print(f"OpenAI discovery request failed ({type(e).__name__})")
            return {"error": "openai_unavailable", "retry": True, "reply": ""}

    if task == "planning":
        if not openai_key:
            return {"error": "openai_not_configured", "retry": False, "reply": ""}
        try:
            return await _route("openai") or {"error": "openai_unavailable", "retry": True, "reply": ""}
        except Exception as e:
            print(f"OpenAI planning request failed ({type(e).__name__})")
            return {"error": "openai_request_failed", "retry": True, "reply": ""}

    # Task-based orchestration: each task tries OpenAI and Gemini only.
    route = list(TASK_ROUTES.get(task or "", []) or [])
    for name in DEFAULT_ROUTE:
        if name not in route:
            route.append(name)
    for name in route:
        try:
            res = await _route(name)
        except Exception as e:
            print(f"orchestrator: provider {name} raised for task={task} ({type(e).__name__})")
            continue
        if res:
            if task:
                print(f"orchestrator: task={task} served by {name}")
            return res

    # All providers failed — return friendly retryable error (not 503)
    return {"error": "temporary", "retry": True, "reply": "", "toast": "حدث خطأ صغير، جرّب تاني 🙏"}


async def test_ai_provider(provider: str) -> dict:
    if provider not in {"openai", "gemini"}:
        raise ValueError(f"Unsupported AI provider: {provider}")
    if provider == "gemini":
        cfg = _get_runtime_settings()
        api_key = cfg.get("gemini_api_key", "")
        model = _gemini_model_name(cfg.get("gemini_model") or "gemini-2.5-flash")
        if not api_key:
            return {"success": False, "code": "missing_key"}

        try:
            import httpx

            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            models_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
            payload = {
                "contents": [{"role": "user", "parts": [{"text": "Reply with OK."}]}],
                "generationConfig": {"maxOutputTokens": 64},
            }
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(url, json=payload)
                available_models = []
                if response.status_code == 404:
                    try:
                        models_response = await client.get(models_url)
                    except httpx.RequestError:
                        models_response = None
                    if models_response is not None and models_response.is_success:
                        try:
                            available_models = [
                                _gemini_model_name(item["name"])
                                for item in models_response.json().get("models", [])
                                if isinstance(item, dict)
                                and isinstance(item.get("name"), str)
                                and isinstance(item.get("supportedGenerationMethods"), list)
                                and "generateContent" in item.get("supportedGenerationMethods", [])
                            ][:15]
                        except (ValueError, AttributeError, TypeError):
                            available_models = []
        except httpx.TimeoutException:
            return {"success": False, "code": "timeout"}
        except httpx.RequestError:
            return {"success": False, "code": "network_error"}

        if response.status_code >= 400:
            try:
                provider_status = str(response.json().get("error", {}).get("status", "")).upper()
            except (ValueError, AttributeError):
                provider_status = ""

            if response.status_code in (401, 403):
                code = "key_or_access_denied"
            elif response.status_code == 404 or provider_status == "NOT_FOUND":
                code = "model_not_available"
            elif response.status_code == 429:
                code = "quota_or_rate_limit"
            else:
                code = "provider_error"
            result = {"success": False, "code": code}
            if code == "model_not_available":
                result["available_models"] = available_models
            return result

        try:
            parts = response.json()["candidates"][0]["content"]["parts"]
        except (ValueError, KeyError, IndexError, TypeError):
            return {"success": False, "code": "empty_response"}
        if not any(part.get("text", "").strip() for part in parts if isinstance(part, dict)):
            return {"success": False, "code": "empty_response"}
        return {"success": True, "code": "ok"}

    result = await _call_openai(
        "Reply with exactly the word OK.",
        "You are performing a short provider connectivity check. Reply only OK.",
        task="connection_test",
        provider_override=provider,
    )
    success = bool(result and not result.get("error") and (result.get("reply") or result))
    return {"success": success, "code": "ok" if success else "connection_failed"}

def _service_unavailable() -> dict:
    # Mock permanently removed: every provider failure surfaces as retryable error
    return {"error": "temporary", "retry": True, "reply": "", "toast": "حدث خطأ صغير"}



# ---- 3 Agents ----

def _detect_lang(text: str, fallback: str = "ar") -> str:
    """Detect dominant language: Arabic or English only."""
    if not text:
        return fallback if fallback in ("ar", "en") else "ar"
    import re
    ar = len(re.findall(r"[\u0600-\u06FF]", text))
    if ar > 0:
        en_words = len(re.findall(r"[a-zA-Z]{2,}", text))
        total_words = len(text.split()) or 1
        # Arabic with a few English tech words -> still ar
        if en_words / total_words <= 0.6:
            return "ar"
        return "en"
    en_words = len(re.findall(r"[a-zA-Z]{2,}", text))
    if en_words > 0:
        return "en"
    return fallback if fallback in ("ar", "en") else "ar"

async def discovery_agent(messages: list, profile: dict, companionName: str, lang: str) -> dict:
    # The structured profile carries older facts; keep only recent turns in
    # the prompt to reduce input latency without losing accumulated context.
    hist = "\n".join([f"{m['role']}: {m['content']}" for m in messages[-8:]])
    q_count = 0
    for m in messages:
        if m["role"] == "assistant":
            c = m["content"]
            # The seeded opener is a greeting, not a question — never count it.
            if (
                ("ZEUS" in c and ("هالو" in c or "Hello" in c or "أهل" in c))
                or c.strip().startswith(("أهلاً، أنا زيوس", "Hello, I'm ZEUS"))
            ):
                continue
            q_count += 1
    # Server-side language detection: Arabic wins if ANY Arabic appears in the
    # whole conversation (history + last message). Explicit override only:
    # user literally asking for English ("رد بالإنجليزي", "english please"...).
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    _all_text = hist + "\n" + (last_user or "")
    _explicit_en = bool(re.search(r"(رد|تكلم|جاوب)?\s*(بالإنجليزي|بالانجليزي|بالإنجليزية)|english please|speak english|reply in english|in english please", _all_text.lower()))
    if _explicit_en:
        eff_lang = "en"
    elif re.search(r"[\u0600-\u06FF]", _all_text):
        eff_lang = "ar"
    else:
        eff_lang = _detect_lang(last_user, lang if lang in ("ar", "en") else "ar")
    known_profile = _merge_discovery_profile(profile, {}, hist, eff_lang)
    wants_plan = _wants_plan_now(last_user) or _affirmative_plan_response(messages)
    if wants_plan:
        quick_profile = known_profile
        has_goal = _has_val(quick_profile, "goal")
        has_level = _has_val(quick_profile, "current_level", "experience", "background")
        if has_goal and has_level:
            return {
                "reply": _discovery_summary(quick_profile, eff_lang),
                "profile": quick_profile,
                "isComplete": True,
                "options": [],
            }
    # State machine: covered dims from profile + history; next = first uncovered in order
    missing = _analyze_missing(known_profile, hist)
    covered = [d for d in REQUIRED_DIMS if d not in missing]
    ordered = [dimension for dimension in DIM_ORDER if dimension in missing]
    # Derive user_facts from history (likes/dislikes/obstacles) for consistency
    user_facts = _extract_facts(hist)
    next_dim = ordered[0] if ordered else ""
    # If last user message looks like a QUESTION to the bot, flag it so bot answers first
    user_asked = _is_question(last_user)
    q_hint = (
        "User asked YOU a question: answer it briefly FIRST, then ask only the NEXT DIMENSION."
        if user_asked else
        "Last message is an answer: acknowledge one specific detail briefly, then ask only the NEXT DIMENSION."
        if next_dim else
        "No more discovery question is needed: briefly summarize what you learned and set isComplete=true."
    )
    # Quote the exact user text so the model answers THIS question, not another topic.
    user_quote = f'\n=== USER SAID (respond to exactly this, nothing else): "{last_user}" ===' if last_user else ""
    # Corrections ("خليها 4 ساعات" after "2") must be acknowledged AND adopted.
    correction_hint = ""
    try:
        _prev_prof = {k: v for k, v in known_profile.items() if v not in (None, "", [], {})}
    except Exception:
        _prev_prof = {}
    if _prev_prof and last_user:
        correction_hint = "\nIf the user corrects a previous answer (new number/choice replaces an old one), acknowledge the NEW value explicitly (e.g. تمام، اعتمدت 4 ساعات) and put ONLY the new value in profile."
    lang_force = "REPLY LANGUAGE: English ONLY. All reply and options in English." if eff_lang == "en" else "REPLY LANGUAGE: Egyptian Arabic ONLY (عامية). All reply and options in Arabic."
    prompt = discovery_prompt(companionName, eff_lang, known_profile, history=hist, next_dim=next_dim, user_facts=user_facts) + f"\n\n=== PROGRESS: {q_count} assistant turns. SETTLED (never ask again): [{','.join(covered)}]. CORE DETAILS STILL UNKNOWN: [{','.join(missing)}]. ===\n{q_hint}{user_quote}{correction_hint}\n{lang_force}\nKeep the reply concise (normally under 35 words); never ask more than one question. Respond JSON: {{\"reply\": string, \"options\": string[] (only meaningful relevant choices; otherwise []), \"isComplete\": bool, \"profile\": object (include all known facts without inventing), \"field_comparison\": array (optional)}}."
    schema = {
        "type": "object",
        "properties": {
            "reply": {"type": "string"},
            "options": {"type": "array", "items": {"type": "string"}},
            "isComplete": {"type": "boolean"},
            "profile": {"type": "object"},
            "field_comparison": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string"},
                        "description": {"type": "string"},
                        "difficulty": {"type": "string"},
                        "daily_tasks": {"type": "string"},
                        "job_titles": {"type": "array", "items": {"type": "string"}},
                        "skills": {"type": "array", "items": {"type": "string"}},
                        "tools": {"type": "array", "items": {"type": "string"}},
                        "example_projects": {"type": "array", "items": {"type": "string"}},
                        "growth_opportunities": {"type": "string"},
                        "specializations": {"type": "array", "items": {"type": "string"}},
                        "workplaces": {"type": "array", "items": {"type": "string"}},
                        "market_outlook": {"type": "string"},
                        "pros": {"type": "array", "items": {"type": "string"}},
                        "cons": {"type": "array", "items": {"type": "string"}},
                        "why_fits": {"type": "string"},
                    },
                    "required": ["field", "description", "difficulty", "daily_tasks", "job_titles", "skills", "example_projects", "specializations", "workplaces", "market_outlook", "why_fits"],
                },
            },
        },
    }
    eff_system = ZEUS_SYSTEM
    if eff_lang == "en":
        eff_system = "You are ZEUS, a friendly learning companion. Reply ONLY in English. Never reply in Arabic. Keep it warm, simple, 1-2 sentences."
    result = await _call_openai(prompt, eff_system, schema, model="gpt-4o-mini", task="discovery")
    if result.get("credit_exhausted"):
        return result
    if result.get("error"):
        # Honest failure only — never a canned conversational reply.
        # Persist whatever profile we already accumulated so no answer is lost.
        try:
            result["profile"] = _merge_discovery_profile(profile, result.get("profile"), hist, eff_lang)
        except Exception:
            pass
        result["reply"] = ""
        result["isComplete"] = False
        return result
    comparisons = result.get("field_comparison")
    if isinstance(comparisons, list):
        cleaned_comparisons = []
        for item in comparisons:
            if not isinstance(item, dict) or not isinstance(item.get("field"), str) or not isinstance(item.get("description"), str):
                continue
            for key in ("job_titles", "skills", "tools", "example_projects", "specializations", "workplaces", "pros", "cons"):
                value = item.get(key, [])
                item[key] = [value] if isinstance(value, str) and value.strip() else value if isinstance(value, list) else []
            for key in ("difficulty", "daily_tasks", "growth_opportunities", "market_outlook", "why_fits"):
                if not isinstance(item.get(key), str):
                    item[key] = ""
            cleaned_comparisons.append(item)
        comparisons = cleaned_comparisons[:3]
        if len(comparisons) >= 2:
            result["field_comparison"] = comparisons
            # Do not let a proposed comparison path become the saved goal.
            if not _has_val(known_profile, "goal"):
                profile_patch = result.get("profile")
                if isinstance(profile_patch, dict):
                    profile_patch.pop("goal", None)
        else:
            result.pop("field_comparison", None)
    result.setdefault("isComplete", False)
    result.setdefault("profile", {})
    # Always return the ACCUMULATED profile (never a sparse patch), so the
    # DNA screen stays rich even if the model only mentions one dimension.
    try:
        result["profile"] = _merge_discovery_profile(profile, result.get("profile"), hist, eff_lang)
    except Exception:
        pass
    merged = result["profile"] if isinstance(result.get("profile"), dict) else {}
    core_missing = _analyze_missing(merged, hist)
    if wants_plan and _has_val(merged, "goal") and _has_val(
        merged, "current_level", "experience", "background"
    ):
        result["isComplete"] = True
        result["reply"] = _discovery_summary(merged, eff_lang)
        result.pop("options", None)
    elif not core_missing:
        result["isComplete"] = True
        result["reply"] = _discovery_summary(merged, eff_lang)
        result.pop("options", None)
    elif core_missing:
        result["isComplete"] = False

    # Do not ask for self-assessed strengths; infer observations only from evidence.
    # Empty reply: retry the LLM once with an explicit nudge — never a canned
    # question. If it still fails, return an honest retryable error (the
    # frontend renders a retry bubble) while KEEPING the merged profile.
    reply_text = (result.get("reply") or "").strip()
    if not reply_text:
        try:
            retry = await _call_openai(
                prompt + "\nYour previous reply was EMPTY. Answer NOW: warm 1-2 sentence reply in the required language, acknowledging the user's last message, then ask exactly ONE question for: " + (next_dim or "the most important thing you still don't know about them") + ".",
                eff_system, schema, model="gpt-4o-mini", task="discovery")
            if (retry and not retry.get("error") and not retry.get("credit_exhausted")
                    and (retry.get("reply") or "").strip()):
                result = retry
                result.setdefault("isComplete", False)
                result.setdefault("profile", {})
                try:
                    result["profile"] = _merge_discovery_profile(profile, result.get("profile"), hist, eff_lang)
                except Exception:
                    pass
                merged = result["profile"] if isinstance(result.get("profile"), dict) else {}
                reply_text = (result.get("reply") or "").strip()
        except Exception:
            pass
    if not reply_text:
        result["reply"] = ""
        result["isComplete"] = False
        return result
    # Leak guard: a prompt/instruction echo must never reach the user.
    if _looks_like_leak(reply_text):
        print(f"discovery leaked prompt echo, suppressing: {reply_text[:200]}")
        result["reply"] = ""
        result["isComplete"] = False
        return result
    # Dedup guard: if reply is identical to previous assistant reply, ask the
    # LLM once more for a DIFFERENT question — never a canned fallback.
    if messages:
        prev_assistant = [m for m in messages if m["role"] == "assistant"]
        if prev_assistant:
            prev = prev_assistant[-1]["content"].strip()
            if result["reply"].strip() == prev:
                try:
                    retry2 = await _call_openai(
                        prompt + "\nYou REPEATED your previous message word-for-word. Ask a DIFFERENT single question now for the next uncovered dimension (" + (next_dim or "whatever is still unknown") + "), in the required language.",
                        eff_system, schema, model="gpt-4o-mini", task="discovery")
                    if (retry2 and not retry2.get("error") and not retry2.get("credit_exhausted")
                            and (retry2.get("reply") or "").strip()
                            and retry2["reply"].strip() != prev
                            and not _looks_like_leak(retry2["reply"])): 
                        result = retry2
                        result.setdefault("isComplete", False)
                        result.setdefault("profile", {})
                        try:
                            result["profile"] = _merge_discovery_profile(profile, result.get("profile"), hist, eff_lang)
                        except Exception:
                            pass
                        merged = result["profile"] if isinstance(result.get("profile"), dict) else {}
                except Exception:
                    pass
    # Validate options: mismatched or malformed options are dropped, never
    # replaced with canned lists. Guards below only remove.
    raw_options = result.get("options")
    if isinstance(raw_options, list):
        result["options"] = list(dict.fromkeys(
            option.strip() for option in raw_options
            if isinstance(option, str) and len(option.strip()) >= 3
        ))[:4]
    else:
        result.pop("options", None)
    if result.get("options"):
        opts_text = " ".join(result["options"]).lower()
        # Contradiction guard: user dislikes something -> drop options praising it
        user_text_all = hist.lower()
        if any(k in user_text_all for k in ["ممل", "مملة", "boring", "بكره الكورسات"]) and any(k in opts_text for k in ["ممتعة", "ممتع", "fun", "enjoyable"]):
            result["options"] = [o for o in result["options"] if not any(k in o.lower() for k in ["ممتعة", "ممتع", "fun", "enjoyable"])]
        # Obstacle guard: never present user's obstacle as a positive option
        if user_facts.get("obstacles") and any(k in opts_text for k in ["ميزة", "advantage", "رائع"]):
            result["options"] = [o for o in result["options"] if not any(k in o.lower() for k in ["ميزة", "advantage"])]
    if len(result.get("options", [])) < 2:
        result.pop("options", None)
    if result.get("isComplete"):
        result.pop("options", None)
    return result

async def planning_agent(profile: dict, goal: str, lang: str, base_nodes: list = None, market_research: dict = None, validation_feedback: str = "") -> dict:
    # Single-model QA: professional, level-customized, reviewed in same call (save tokens)
    level = (profile or {}).get("current_level", "beginner")
    known = list((profile or {}).get("known_skills", []) or [])
    for item in (profile or {}).get("skill_graph", []) or []:
        if isinstance(item, dict) and item.get("skill") and (item.get("level") or 0) >= 70 and item["skill"] not in known:
            known.append(item["skill"])
    style = (profile or {}).get("learning_style", "mixed")
    vpref = (profile or {}).get("video_preference", "free")
    video_length = (profile or {}).get("video_length_preference") or "mixed"
    extra_qa = f"\nQA SELF-CHECK (single model): level={level}, known_skills={known} (skip them, don't repeat basics if known), style={style}, video_preference={vpref} (free=youtube/docs only, mixed=may include Udemy/Coursera), preferred video length={video_length}. Ensure sequencing prerequisites first, language match, professional depth for level, no hallucinated URLs. If weak, fix before returning."
    prompt = roadmap_prompt(profile, goal, lang, base_nodes, market_research) + extra_qa
    if validation_feedback:
        prompt += f"\nROADMAP VALIDATION FEEDBACK: The previous draft was incomplete. Correct these specific omissions before returning a new complete roadmap: {validation_feedback}"
    schema = {
        "type": "object",
        "properties": {
            "nodes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"}, "title": {"type": "string"}, "phase": {"type": "number"},
                        "phase_title": {"type": "string"}, "phase_objective": {"type": "string"},
                        "objective": {"type": "string"}, "skills": {"type": "array", "items": {"type": "string"}},
                        "tools": {"type": "array", "items": {"type": "string"}},
                        "estimated_hours": {"type": "number"}, "tasks": {"type": "array", "items": {"type": "string"}},
                        "projects": {"type": "array", "items": {"type": "string"}},
                        "resources": {"type": "array", "items": {"type": "object", "properties": {"title": {"type": "string"}, "type": {"type": "string"}, "tier": {"type": "string"}, "url": {"type": "string"}}}},
                        "parent_ids": {"type": "array", "items": {"type": "string"}}
                    },
                    "required": ["id", "title", "phase", "phase_title", "phase_objective", "objective", "skills", "tools", "estimated_hours", "tasks", "projects", "resources", "parent_ids"]
                }
            }
        },
        "required": ["nodes"]
    }
    result = await _call_openai(prompt, ZEUS_SYSTEM, schema, model="gpt-4o", max_tokens=14000, task="planning")
    if result.get("credit_exhausted"):
        return result
    if result.get("error"):
        return result
    if "nodes" not in result or not result.get("nodes"):
        return {"error": "openai_invalid_response", "retry": True, "reply": ""}
    if market_research:
        result["market_research"] = market_research
    return result

async def execution_agent(lesson: dict, messages: list, lang: str) -> dict:
    hist = "\n".join([f"{m['role']}: {m['content']}" for m in messages[-8:]])
    system = ZEUS_SYSTEM + "\nYou are a lesson tutor. Answer the student's ACTUAL question directly and precisely — never dodge it for another topic. Help user understand lesson, answer questions, don't give quiz answers."
    try:
        lesson_str = json.dumps(lesson, ensure_ascii=False, default=str)
    except Exception:
        lesson_str = str({k: v for k, v in (lesson or {}).items() if k in ("node_title", "phase", "summary")})
    prompt = f"Lesson: {lesson_str}\n\nConversation:\n{hist}\n\nReply in {'Egyptian Arabic' if lang=='ar' else 'English'}."
    result = await _call_openai(prompt, system, None, model="gpt-4o-mini", task="tutor")
    if result.get("credit_exhausted"):
        return result
    return result

async def recommend_goals_agent(profile: dict, goal: str, lang: str) -> dict:
    prompt = f"""Recommend 3-5 distinct learning/career paths that fit this learner.
Learner profile: {json.dumps(profile, ensure_ascii=False)}
Their stated interests/goal: {goal}
Reply language: {"Egyptian Arabic" if lang == "ar" else "English"}.
For every path, explain the actual work, entry difficulty, role titles, a realistic first project, why it fits THIS learner, and a concise ordered outline of what they would learn. Mention market demand only as a qualitative observation; never promise a job or salary.
    If the goal is broad AI/Artificial Intelligence or AI Engineer, the FIRST recommendation must be the primary comprehensive "AI Engineer" path, not a narrow specialization. Its learning_outline must have 10-14 ordered stages covering from programming foundations, math/statistics, data and SQL, classical ML, deep learning, Computer Vision, NLP, transformers/LLMs and RAG, evaluation/safety, deployment/APIs, MLOps/cloud, through a capstone portfolio. This primary path means learning the broad AI engineer toolkit; do not imply every learner must become an expert in every subfield.
    Then include 2-4 genuinely distinct OPTIONAL specialization paths (for example Machine Learning Engineer, Computer Vision Engineer, and NLP/LLM Engineer) as alternatives after the comprehensive path. Make clear what each focuses on and what it omits compared with the full AI Engineer path. Explain each path's day-to-day work, core skills/tools, realistic projects, and typical employers. Keep market observations qualitative and avoid claiming live hiring data.
    For focused non-AI goals, provide 3-5 relevant distinct paths as usual. For every recommendation, explain the actual work, entry difficulty, role titles, a realistic first project, why it fits THIS learner, and a concise ordered outline of what they would learn.
    Return JSON with `recommendations` and `key_skills`. Each recommendation must have: goal, score (0-100 fit, not hiring probability), reason, description, nature, difficulty, current_level, gap, what_to_learn, learning_outline (3-6 ordered strings for focused alternatives; 10-14 stages for the primary broad AI Engineer path), key_skills (3-8 field-specific skills), tools, job_titles, example_projects (1-2 specific projects), why_fits, tradeoffs."""
    schema = {
        "type": "object",
        "properties": {
            "recommendations": {"type": "array"},
            "key_skills": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["recommendations"],
    }

    broad_ai_goal = is_broad_ai_goal(goal)

    def _valid(r):
        recs = (r or {}).get("recommendations") or []
        if not isinstance(recs, list) or len(recs) < (3 if broad_ai_goal else 2):
            return False
        required_lists = ("key_skills", "learning_outline", "example_projects", "tools", "job_titles")
        all_valid = all(
            isinstance(item, dict)
            and item.get("goal")
            and item.get("reason")
            and isinstance(item.get("score"), (int, float))
            and 0 <= item["score"] <= 100
            and item.get("description")
            and item.get("nature")
            and all(isinstance(item.get(key), list) for key in required_lists)
            and len(item["key_skills"]) >= 3
            and len(item["learning_outline"]) >= (10 if broad_ai_goal and index == 0 else 3)
            and item["example_projects"]
            for index, item in enumerate(recs)
        )
        if not all_valid:
            return False
        if broad_ai_goal:
            primary_title = str(recs[0].get("goal", "")).casefold()
            if not ("ai engineer" in primary_title or "مهندس ذكاء اصطناعي" in primary_title or "مهندس الذكاء الاصطناعي" in primary_title):
                return False
            alternatives = " ".join(
                str(value)
                for item in recs[1:]
                for value in [item.get("goal"), item.get("description"), item.get("nature"), *(item.get("key_skills") or [])]
            ).casefold()
            alternative_tracks = (
                ("machine learning", "ml engineer", "تعلم الآلة", "التعلم الآلي"),
                ("computer vision", "cv engineer", "الرؤية الحاسوبية", "رؤية الكمبيوتر"),
                ("natural language", "nlp", "llm", "معالجة اللغة", "معالجة اللغات"),
            )
            return all(any(term in alternatives for term in track) for track in alternative_tracks)
        return True
    for attempt in range(2):
        try:
            cand = await _call_openai(prompt, ZEUS_SYSTEM, schema, model="gpt-4o-mini", task="recommend")
        except Exception as e:
            print(f"recommendGoals fail (attempt {attempt+1}): {e}")
            cand = None
        if cand and cand.get("credit_exhausted"):
            return cand
        if _valid(cand):
            result = cand
            break
        result = cand
    res = result or {}
    if res.get("credit_exhausted"):
        return res
    if not _valid(res):
        return {"error": "temporary", "retry": True, "reply": "", "toast": "حدث خطأ صغير"}
    res["is_comprehensive_ai_path"] = broad_ai_goal
    return res

async def generate_quiz_from_content(content: str, lang: str, num: int = 10) -> dict:
    """Create a balanced, explanation-backed quiz grounded in the lesson."""
    ref = (content or "")[:12000]
    prompt = (
        f"Create {num} unique assessment questions using ONLY the lesson below. "
        "Use a balanced mix: concept understanding, recall, practical application, realistic scenarios, and error/debugging analysis. "
        "Each question must test one specific taught objective, not trivia; use plausible but clearly incorrect distractors, exactly 4 options for MCQ or exactly 2 for true/false, "
        "one unambiguous correct answer, and a 2-3 sentence explanation that teaches why it is correct. "
        "Do not repeat the same concept/question in different wording. Difficulty must progress from foundational to applied. "
        "Return actual question data, never the JSON schema or field definitions. "
        "The response must be an object with a questions array; every array item must include question, type, options, correct, explanation, and skill. "
        f"Lesson content:\n{ref}\nLanguage: {lang}. Return only the completed JSON object."
    )
    schema = {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string"},
                        "type": {"type": "string"},
                        "options": {"type": "array", "items": {"type": "string"}},
                        "correct": {"type": "integer"},
                        "explanation": {"type": "string"},
                        "skill": {"type": "string"},
                    },
                    "required": ["question", "type", "options", "correct", "explanation"],
                },
            }
        },
        "required": ["questions"],
    }
    for attempt in range(2):
        request_prompt = prompt
        if attempt:
            request_prompt += (
                "\nYour previous response did not contain actual questions. "
                "Do not output keys such as properties, type, or required as schema definitions. "
                "Fill questions with real lesson-specific questions, answer options, correct indexes, and explanations."
            )
        result = await _call_openai(
            request_prompt, ZEUS_SYSTEM, schema,
            model="gpt-4o-mini", task="quiz",
        )
        if result.get("credit_exhausted") or result.get("error"):
            if attempt == 0 and result.get("retry", True):
                continue
            return result
        questions = result.get("questions")
        if not isinstance(questions, list):
            continue
        valid_questions = []
        for question in questions:
            if not isinstance(question, dict):
                continue
            options = question.get("options")
            correct = question.get("correct")
            explanation = question.get("explanation")
            if (
                not isinstance(question.get("question"), str)
                or not question["question"].strip()
                or not isinstance(options, list)
                or len(options) not in (2, 4)
                or any(not isinstance(option, str) or not option.strip() for option in options)
                or not isinstance(correct, int)
                or isinstance(correct, bool)
                or not 0 <= correct < len(options)
                or not isinstance(explanation, str)
                or len(explanation.strip()) < 20
            ):
                continue
            valid_questions.append(question)
        if len(valid_questions) >= 8:
            result["questions"] = valid_questions[:num]
            return result
    return {
        "error": "temporary",
        "retry": True,
        "reply": "",
        "toast": "تعذّر تجهيز الاختبار — حاول تاني" if lang == "ar" else "Couldn't build the quiz — retry",
    }

async def generate_assessment_quiz(goal: str, skills: list, lang: str, num: int = 5) -> dict:
    """Short placement quiz for onboarding assessment (non-beginners).

    Builds {num} MCQ questions spanning the given key skills at mixed
    easy/medium difficulty so a blended score can calibrate self-ratings.
    """
    skill_list = ", ".join((skills or [])[:8]) or goal
    prompt = (
        f"Write {num} multiple-choice placement questions to assess a learner's level in '{goal}'. "
        f"Spread questions across these skills: {skill_list}. Mix easy (2) and medium ({num - 2}) difficulty. "
        f"Each question has exactly 4 options with ONE correct answer testing real understanding, not trivia. "
        f"Language: {lang}. JSON {{\"questions\":[{{\"question\":string,\"type\":string,\"options\":[4 strings],\"correct\":number,\"explanation\":string,\"skill\":string}}]}}"
    )
    schema = {"type": "object", "properties": {"questions": {"type": "array"}}}
    r = await _call_openai(prompt, ZEUS_SYSTEM, schema, model="gpt-4o-mini", task="assessment")
    if r.get("credit_exhausted"):
        return r
    return r


async def review_project_agent(project_brief: str, submission_text: str, submission_url: str, lang: str) -> dict:
    """Review a learner's phase-project submission like a senior mentor.

    Returns {approved, score 0-100, feedback, strengths[], improvements[], next_step}.
    Pass mark is 70 — same bar as lesson quizzes.
    """
    brief = (project_brief or "")[:3000]
    sub = (submission_text or "")[:4000]
    url = (submission_url or "")[:500]
    prompt = (
        "You are a senior mentor reviewing a learner's phase project. Be encouraging but honest. "
        f"PROJECT BRIEF (what was asked): {brief} "
        f"LEARNER SUBMISSION (description of what they built): {sub} "
        f"REPO/LINK (may be empty): {url} "
        "Evaluate: does the submission genuinely attempt the brief? Is it complete and working as described? "
        "Approve (approved=true, score>=70) when the work shows real effort and covers the core requirements, "
        "even if polish is missing. Reject when it is off-topic, copy-pasted without understanding, far too thin, "
        "or missing core requirements. "
        f"Reply in {lang}. JSON {{\"approved\":boolean,\"score\":number,\"feedback\":string (2-4 sentences: what works + the single most important fix),\"strengths\":[strings],\"improvements\":[strings],\"next_step\":string}}"
    )
    schema = {"type": "object", "properties": {"approved": {"type": "boolean"}, "score": {"type": "number"}, "feedback": {"type": "string"}, "strengths": {"type": "array"}, "improvements": {"type": "array"}, "next_step": {"type": "string"}}}
    r = await _call_openai(prompt, ZEUS_SYSTEM, schema, model="gpt-4o-mini", task="review")
    if r.get("credit_exhausted"):
        return r
    return r


async def search_jobs_agent(profile: dict, cv: dict, lang: str) -> dict:
    prompt = (
        f"Recommend 5 REAL entry-level job listings for profile {json.dumps(profile, ensure_ascii=False)} "
        f"CV {json.dumps(cv, ensure_ascii=False)} lang {lang}. "
        "Prefer real postings the user can actually open (company career pages, LinkedIn, Wuzzuf for Egypt/MENA, RemoteOK/Remote for remote). "
        "RULES: every job MUST have a real, specific apply url (https://... pointing at the posting or a real search page for that exact role — never '#', never empty, never example.com). "
        "match_score is 0-100 fit vs the user's skills. required_skills/missing_skills are short skill names. "
        'JSON {"jobs": [{"title": string, "company": string, "location": string, '
        '"url": string, "apply_url": string, "match_score": number, "description": string (1-2 sentences), '
        '"required_skills": string[], "missing_skills": string[], "why_fits": string}]}'
    )
    schema = {"type": "object", "properties": {"jobs": {"type": "array"}}, "required": ["jobs"]}
    r = await _call_openai(prompt, ZEUS_SYSTEM, schema, model="gpt-4o-mini", task="jobs")
    if r.get("credit_exhausted"):
        return r
    return r

async def rewrite_text_agent(text: str, is_ar: bool, kind: str = "summary") -> dict:
    # CV + Portfolio content must ALWAYS be English ATS-friendly; auto-translate Arabic.
    if kind in ("summary", "project", "cv", "experience"):
        prompt = f"Rewrite the following {kind} as professional ATS-friendly English resume wording (action verbs, quantified impact, no Arabic, plain ASCII bullets). Auto-translate any Arabic to natural English. Text: {text}. JSON {{\"rewritten\": string}}"
    else:
        prompt = f"Rewrite {kind} professionally in {'Egyptian Arabic' if is_ar else 'English'}: {text}. JSON {{\"rewritten\": string}}"
    res = await _call_openai(prompt, ZEUS_SYSTEM, {"type":"object","properties":{"rewritten":{"type":"string"}}}, model="gpt-4o-mini", task="rewrite")
    if res.get("credit_exhausted"):
        return res
    return res.get("rewritten", res.get("reply", text))
