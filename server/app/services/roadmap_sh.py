"""
Hidden roadmap.sh integration via GitHub raw (nilbuild/developer-roadmap)
No external string is exposed to frontend - returns nodes only.
"""
import httpx
import time
import re

RAW_BASE = "https://raw.githubusercontent.com/nilbuild/developer-roadmap/master/roadmaps"
API_BASE = "https://api.github.com/repos/nilbuild/developer-roadmap/contents/roadmaps"

# Map Arabic + English goal variations -> slug (lowercase)
SLUG_MAP = {
    # Roles
    "frontend": "frontend", "front-end": "frontend", "فرونت اند": "frontend", "واجهات": "frontend",
    "backend": "backend", "back-end": "backend", "باك اند": "backend", "باك إند": "backend",
    "full stack": "full-stack", "full-stack": "full-stack", "فل ستاك": "full-stack",
    "devops": "devops",
    "ai": "ai-engineer", "ai engineer": "ai-engineer", "ذكاء اصطناعي": "ai-engineer", "ai-engineer": "ai-engineer",
    "data analyst": "data-analyst", "تحليل بيانات": "data-analyst", "data-analyst": "data-analyst",
    "data engineer": "data-engineer", "data-engineer": "data-engineer",
    "machine learning": "machine-learning", "ml": "machine-learning",
    "cyber security": "cyber-security", "cyber-security": "cyber-security", "امن سيبراني": "cyber-security",
    "android": "android", "ios": "ios", "flutter": "flutter",
    "python": "python", "بايثون": "python",
    "javascript": "javascript", "js": "javascript",
    "typescript": "typescript", "ts": "typescript",
    "react": "react", "رياكت": "react",
    "nodejs": "nodejs", "node": "nodejs", "node.js": "nodejs",
    "docker": "docker", "دocker": "docker",
    "kubernetes": "kubernetes",
    "sql": "sql", "قواعد بيانات": "sql",
    "devsecops": "devsecops", "qa": "qa", "product manager": "product-manager",
}

_cache: dict = {}
_cache_time: dict = {}
TTL = 24 * 60 * 60  # 24h
NEG_TTL = 24 * 60 * 60

def _norm(goal: str) -> str:
    if not goal:
        return ""
    g = goal.strip().lower()
    # Remove extra spaces, keep only letters
    return g

def _slug_for(goal: str) -> str | None:
    if not goal:
        return None
    g = _norm(goal)
    # Direct match
    if g in SLUG_MAP:
        return SLUG_MAP[g]
    # Try contains
    for k, v in SLUG_MAP.items():
        if k in g or g in k:
            return v
    return None

async def fetch_roadmap_sh(goal: str) -> dict | None:
    """Fetch roadmap structure for goal, return {"nodes": [...]} or None if not found."""
    slug = _slug_for(goal)
    if not slug:
        return None

    now = time.time()
    # Check cache (positive and negative)
    if slug in _cache:
        if now - _cache_time.get(slug, 0) < TTL:
            return _cache[slug]
        # Expired
        _cache.pop(slug, None)
    # Negative cache: slug -> None
    neg_key = f"neg:{slug}"
    if neg_key in _cache and now - _cache_time.get(neg_key, 0) < NEG_TTL:
        return None

    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "ZEUS/1.0"}) as client:
            # List content directory
            r = await client.get(f"{API_BASE}/{slug}/content")
            if r.status_code == 404:
                _cache[neg_key] = None
                _cache_time[neg_key] = now
                return None
            if r.status_code != 200:
                return None
            files = [f["name"] for f in r.json() if f["name"].endswith(".md")]
            if not files:
                return None
            # Take up to 12 files for roadmap
            files = files[:12]
            nodes = []
            for idx, fname in enumerate(files):
                try:
                    md = await client.get(f"{RAW_BASE}/{slug}/content/{fname}")
                    if md.status_code != 200:
                        continue
                    title = fname.split("@")[0].replace("-", " ").title()
                    # Clean objective from markdown first lines
                    text = md.text.strip().split("\n")[0][:200] if md.text else title
                    # Remove markdown markers
                    text = re.sub(r"[#*_`]", "", text).strip()[:150]
                    if not text:
                        text = title
                    nodes.append({
                        "id": f"{slug}-{idx+1}",
                        "title": title,
                        "phase": (idx // 3) + 1,
                        "objective": text or f"Learn {title}",
                        "skills": [title],
                        "estimated_hours": 8,
                        "tasks": [f"اقرأ دليل {title}" if "ar" in goal.lower() else f"Study {title}", f"طبق {title} عملياً", f"راجع {title}"],
                        "projects": [],
                        "resources": [{"title": title, "type": "docs", "tier": "best_match", "url": f"https://youtube.com/results?search_query={title.replace(' ', '+')}"}],
                        "parent_ids": [f"{slug}-{idx}"] if idx > 0 else []
                    })
                except Exception:
                    continue
            if not nodes:
                return None
            result = {"nodes": nodes}
            _cache[slug] = result
            _cache_time[slug] = now
            return result
    except Exception as e:
        print(f"roadmap_sh fetch error for {goal} ({slug}): {e}")
        return None
    return None
