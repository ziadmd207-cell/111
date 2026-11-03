"""
Resources fetcher - YouTube (Data API v3 with view/like quality ranking,
HTML-scraping fallback) + Docs via HTML parsing + ranking.
"""
import httpx
import re
import time
import urllib.parse
import asyncio
import threading

try:
    from dotenv import load_dotenv
    import os as _os
    load_dotenv(_os.path.join(_os.path.dirname(__file__), "../../.env"))
except Exception:
    pass

_cache: dict = {}
TTL = 24 * 60 * 60

# Quality gates: skip dead/unwatched videos so lessons link real content
MIN_VIEWS = 1000
MIN_LIKES = 5

# No hardcoded API keys: DB admin_settings > YOUTUBE_API_KEY env wins.
# Empty key falls back to HTML scraping (no quota). Never commit a real key.
YOUTUBE_API_FALLBACK_KEY = ""
_youtube_key_cursor = 0
_youtube_key_lock = threading.Lock()

def _yt_keys() -> list[str]:
    import os
    keys = []
    try:
        from ..core.database import engine
        from sqlmodel import Session
        from ..models import AdminSetting
        with Session(engine) as session:
            s = session.get(AdminSetting, "default")
            if s:
                configured = (s.ai_task_routes or {}).get("youtube_keys")
                if isinstance(configured, list):
                    keys.extend(
                        (item.get("api_key", "") if isinstance(item, dict) else str(item or "")).strip()
                        for item in configured
                    )
                elif s.youtube_api_key:
                    keys.append(s.youtube_api_key.strip())
    except Exception:
        pass
    try:
        from ..core.config import settings
        keys.extend([
            os.getenv("YOUTUBE_API_KEY", "").strip(),
            (settings.youtube_api_key or "").strip(),
            YOUTUBE_API_FALLBACK_KEY.strip(),
        ])
    except Exception:
        keys.extend([os.getenv("YOUTUBE_API_KEY", "").strip(), YOUTUBE_API_FALLBACK_KEY.strip()])
    return list(dict.fromkeys(key for key in keys if key))


def _rotated_yt_keys() -> list[str]:
    global _youtube_key_cursor
    keys = _yt_keys()
    if not keys:
        return []
    with _youtube_key_lock:
        start = _youtube_key_cursor % len(keys)
        _youtube_key_cursor += 1
    return keys[start:] + keys[:start]


def _yt_key() -> str:
    return next(iter(_rotated_yt_keys()), "")


_STOPWORDS = {
    "في", "من", "على", "الي", "إلي", "إلى", "عن", "مع", "و", "أو", "ما", "لا", "كل",
    "تعلم", "شرح", "مقدمة", "اساسيات", "أساسيات", "كورس", "دورة", "كاملة", "كامل",
    "the", "a", "an", "to", "of", "for", "in", "on", "and", "with", "learn",
    "learning", "course", "tutorial", "tutorials", "introduction", "intro",
    "complete", "full", "beginners", "beginner", "crash", "basics", "guide",
}


def _rel_words(text: str) -> set:
    normalized_text = (text or "").lower()
    words = {
        word for word in re.findall(r"[\w\u0600-\u06FF]{2,}", normalized_text)
        if word not in _STOPWORDS and (len(word) >= 3 or word in {"ai", "ml", "ui", "ux"})
    }
    if "ai" in words or "genai" in words or {"artificial", "intelligence"}.issubset(words):
        words.update({"ai", "artificial", "intelligence"})
    if "ml" in words or re.search(r"\bmachine\s+learning\b", normalized_text):
        words.update({"ml", "machine", "learning"})
    if "nlp" in words or re.search(r"\bnatural\s+language\s+processing\b", normalized_text):
        words.update({"nlp", "natural", "language", "processing"})
    return words


def _relevance(title: str, *contexts: str) -> int:
    """Shared meaningful words between a video title and our topic."""
    tw = _rel_words(title)
    if not tw:
        return 0
    score = 0
    for ctx in contexts:
        score += len(tw & _rel_words(ctx))
    return score


async def _search_youtube_api(query: str, lang: str, max_results=3, must_match: str = "", preferred_length: str = "mixed"):
    """YouTube Data API v3: order by views, then rank by views+likes.

    Costs ~101 quota units per call (search=100 + videos=1); results are
    cached 24h per node so repeated lesson opens cost nothing.
    Raises/falls back silently (returns []) on quota/key errors.
    """
    keys = _rotated_yt_keys()
    if not keys:
        return []
    q = f"{query} {'شرح عربي' if lang == 'ar' else 'tutorial'}"
    for key in keys:
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                search = await client.get(
                    "https://www.googleapis.com/youtube/v3/search",
                    params={
                        "key": key, "q": q, "part": "snippet", "type": "video",
                        "maxResults": 10, "order": "viewCount",
                        "relevanceLanguage": "ar" if lang == "ar" else "en",
                        "safeSearch": "moderate", "videoEmbeddable": "true",
                    },
                )
                if search.status_code != 200:
                    print(f"youtube api search failed ({search.status_code}); trying next key")
                    continue
                ids = [item["id"]["videoId"] for item in search.json().get("items", []) if item.get("id", {}).get("videoId")]
                if not ids:
                    return []
                videos = await client.get(
                    "https://www.googleapis.com/youtube/v3/videos",
                    params={"key": key, "id": ",".join(ids), "part": "statistics,snippet,contentDetails"},
                )
                if videos.status_code != 200:
                    print(f"youtube api video details failed ({videos.status_code}); trying next key")
                    continue
                out = []
                for item in videos.json().get("items", []):
                    video_id = item.get("id", "")
                    stats = item.get("statistics", {}) or {}
                    try:
                        views = int(stats.get("viewCount", 0) or 0)
                    except (TypeError, ValueError):
                        views = 0
                    try:
                        likes = int(stats.get("likeCount", 0) or 0)
                    except (TypeError, ValueError):
                        likes = 0
                    if views < MIN_VIEWS or likes < MIN_LIKES:
                        continue
                    title = ((item.get("snippet", {}) or {}).get("title")) or query
                    duration = _parse_iso8601_duration(((item.get("contentDetails", {}) or {}).get("duration")) or "")
                    out.append({
                        "videoId": video_id, "views": views, "likes": likes,
                        "duration_sec": duration, "duration_display": _fmt_duration(duration),
                        "description": ((item.get("snippet", {}) or {}).get("description")) or "",
                        "relevance": _relevance(
                            title,
                            query,
                            must_match,
                            ((item.get("snippet", {}) or {}).get("description")) or "",
                        ),
                        "url": f"https://www.youtube.com/watch?v={video_id}", "title": title,
                    })
                if must_match:
                    topic_words = _rel_words(must_match)
                    out = [
                        item for item in out
                        if (_rel_words(item.get("title", "")) | _rel_words(item.get("description", ""))) & topic_words
                    ]
                out.sort(
                    key=lambda item: (
                        item.get("relevance", 0),
                        _duration_match_score(item.get("duration_sec", 0), preferred_length),
                        item["views"],
                        item["likes"],
                    ),
                    reverse=True,
                )
                return out[:max_results]
        except Exception as exc:
            print(f"youtube api request failed ({type(exc).__name__}); trying next key")
    return []

def _cache_key(node_id, lang, style):
    return f"{node_id}:{lang}:{style}"

async def _validate_youtube_video(vid: str) -> dict | None:
    """Validate via oEmbed - returns title if valid, None if unavailable."""
    try:
        async with httpx.AsyncClient(timeout=5, headers={"User-Agent": "Mozilla/5.0"}) as client:
            r = await client.get(f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json")
            if r.status_code == 200:
                j = r.json()
                return {"title": j.get("title", ""), "valid": True}
            return None
    except:
        return None

async def _search_youtube_no_key(query: str, lang: str, max_results=3):
    """Fetch youtube search results without API key via HTML parsing + oEmbed validation."""
    q = urllib.parse.quote(f"{query} {'شرح عربي' if lang=='ar' else ''}")
    url = f"https://www.youtube.com/results?search_query={q}"
    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "Mozilla/5.0"}) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return []
            text = r.text
            video_matches = list(re.finditer(r'"videoId":"([a-zA-Z0-9_-]{11})"', text))
            metadata_by_video = {}
            for match_index, match in enumerate(video_matches):
                next_start = video_matches[match_index + 1].start() if match_index + 1 < len(video_matches) else match.end() + 4000
                segment = text[match.end():max(match.end(), min(next_start, match.end() + 4000))]
                duration_match = re.search(r'"lengthText":\{"simpleText":"([^"]+)"\}', segment)
                view_match = re.search(r'"viewCountText":\{"simpleText":"([^"]+)"\}', segment)
                title_match = re.search(r'"title":\{"runs":\[\{"text":"([^"]+)"', segment)
                metadata_by_video.setdefault(match.group(1), {
                    "duration": duration_match.group(1) if duration_match else "",
                    "views": view_match.group(1) if view_match else "0",
                    "title": title_match.group(1) if title_match else "",
                })
            # Deduplicate preserving order
            uniq_vids = list(metadata_by_video)[:max_results * 2]
            semaphore = asyncio.Semaphore(5)

            async def validate(vid):
                async with semaphore:
                    return await _validate_youtube_video(vid)

            # Validate a small candidate batch concurrently to keep fallback latency bounded.
            validation_results = await asyncio.gather(*(validate(vid) for vid in uniq_vids))
            validated = []
            for vid, info in zip(uniq_vids, validation_results):
                if not info:
                    continue
                metadata = metadata_by_video[vid]
                num = _parse_views(metadata["views"])
                # Use real title from oEmbed if available
                title = info.get("title") or metadata["title"] or query
                duration = _parse_display_duration(metadata["duration"])
                validated.append({"videoId": vid, "views": num, "likes": 0, "duration_sec": duration, "duration_display": _fmt_duration(duration), "url": f"https://www.youtube.com/watch?v={vid}", "title": title})
            validated.sort(key=lambda x: x["views"], reverse=True)
            return validated[:max_results * 2]
    except Exception as e:
        print(f"youtube search error: {e}")
        return []

def _duration_match_score(duration_sec: int, preferred_length: str) -> int:
    if not duration_sec:
        return 0
    if preferred_length == "short":
        return 2 if duration_sec <= 10 * 60 else 0
    if preferred_length == "long":
        return 2 if duration_sec >= 18 * 60 else 0
    return 0


def _preferred_length_for_node(preference: str, title: str, objective: str = "") -> str:
    if preference in ("short", "long"):
        return preference
    topic = f"{title} {objective}".lower()
    if any(word in topic for word in ("overview", "introduction", "intro", "concept", "definition", "مقدمة", "مفهوم", "تعريف")):
        return "short"
    if any(word in topic for word in ("project", "implementation", "walkthrough", "end-to-end", "build", "تنفيذ", "مشروع", "تطبيق عملي")):
        return "long"
    return "mixed"


async def _search_youtube_best(
    query: str, lang: str, max_results=3, must_match: str = "", exclude: tuple = (), preferred_length: str = "mixed"
):
    """API first (relevance+view/like-ranked), HTML-scraping fallback when key/quota fails."""
    got = await _search_youtube_api(query, lang, max_results + len(exclude), must_match, preferred_length)
    got = [v for v in got if v.get("videoId") not in (exclude or ())]
    if got:
        return got[:max_results]
    fb = await _search_youtube_no_key(query, lang, max_results + len(exclude))
    fb = [v for v in fb if v.get("videoId") not in (exclude or ())]
    if must_match:
        topic_words = _rel_words(must_match)
        fb = [v for v in fb if _rel_words(v.get("title", "")) & topic_words]
    fb.sort(
        key=lambda video: (
            _duration_match_score(video.get("duration_sec", 0), preferred_length),
            _relevance(video.get("title", ""), must_match, query),
            video.get("views", 0),
        ),
        reverse=True,
    )
    return fb[:max_results]


def _video_id_from_url(url: str) -> str | None:
    """Extract an 11-char YouTube id from watch/embed/shorts/youtu.be URLs."""
    if not url:
        return None
    m = re.search(r"(?:v=|youtu\.be/|/embed/|/shorts/)([a-zA-Z0-9_-]{11})", url)
    return m.group(1) if m else None


def _is_youtube_url(url: str) -> bool:
    if not url:
        return False
    u = url.lower()
    return ("youtube.com" in u or "youtu.be" in u) and _video_id_from_url(url) is not None


def _parse_iso8601_duration(iso: str) -> int:
    """PT1H2M3S -> seconds (YouTube contentDetails.duration)."""
    if not iso:
        return 0
    m = re.match(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$", iso.strip())
    if not m:
        return 0
    h, mi, s = (int(x) if x else 0 for x in m.groups())
    return h * 3600 + mi * 60 + s


def _parse_display_duration(value: str) -> int:
    parts = [int(part) for part in re.findall(r"\d+", value or "")]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 1:
        return parts[0]
    return 0


def _fmt_duration(sec: int) -> str:
    sec = int(sec or 0)
    h, rem = divmod(sec, 3600)
    mi, s = divmod(rem, 60)
    return f"{h}:{mi:02d}:{s:02d}" if h else f"{mi}:{s:02d}"


_embed_cache: dict = {}
_meta_cache: dict = {}


async def _video_meta(vid: str) -> dict:
    """One cached videos.list call: embeddability + duration + title."""
    if not vid:
        return {"embeddable": False, "duration_sec": 0, "title": None}
    if vid in _meta_cache:
        return _meta_cache[vid]
    meta = {"embeddable": False, "duration_sec": 0, "title": None, "description": ""}
    keys = _rotated_yt_keys()
    if keys:
        for key in keys:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    r = await client.get(
                        "https://www.googleapis.com/youtube/v3/videos",
                        params={"key": key, "id": vid, "part": "status,contentDetails,snippet"},
                    )
                if r.status_code != 200:
                    print(f"youtube video meta status {r.status_code}; trying next key")
                    continue
                items = r.json().get("items", [])
                if items:
                    it = items[0]
                    st = it.get("status", {}) or {}
                    meta["embeddable"] = bool(st.get("embeddable", False)) and st.get("privacyStatus") in ("public", "unlisted")
                    meta["duration_sec"] = _parse_iso8601_duration(((it.get("contentDetails", {}) or {}).get("duration")) or "")
                    meta["title"] = ((it.get("snippet", {}) or {}).get("title"))
                    meta["description"] = ((it.get("snippet", {}) or {}).get("description")) or ""
                break
            except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError) as e:
                print(f"video meta error ({type(e).__name__}); trying next key")
    else:
        meta["embeddable"] = (await _validate_youtube_video(vid)) is not None
    _meta_cache[vid] = meta
    return meta


async def _batch_embeddable(vids: list) -> set:
    """One videos.list call for many ids -> set of playable videoIds."""
    vids = [v for v in dict.fromkeys(vids or []) if v]
    if not vids:
        return set()
    known = {v for v in vids if v in _embed_cache}
    unknown = [v for v in vids if v not in _embed_cache]
    ok = {v for v in known if _embed_cache[v]}
    keys = _rotated_yt_keys()
    if unknown and keys:
        # 50 ids per call max. Retry each chunk with another key on quota/access failures.
        for i in range(0, len(unknown), 50):
            chunk = unknown[i:i + 50]
            for key in keys:
                try:
                    async with httpx.AsyncClient(timeout=12) as client:
                        r = await client.get(
                            "https://www.googleapis.com/youtube/v3/videos",
                            params={"key": key, "id": ",".join(chunk), "part": "status"},
                        )
                    if r.status_code != 200:
                        print(f"youtube batch status {r.status_code}; trying next key")
                        continue
                    for it in r.json().get("items", []):
                        st = it.get("status", {}) or {}
                        good = bool(st.get("embeddable", False)) and st.get("privacyStatus") in ("public", "unlisted")
                        _embed_cache[it.get("id", "")] = good
                        if good:
                            ok.add(it.get("id", ""))
                    break
                except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError) as e:
                    print(f"youtube batch error ({type(e).__name__}); trying next key")
    if unknown and not keys:
        for v in unknown:
            good = (await _validate_youtube_video(v)) is not None
            _embed_cache[v] = good
            if good:
                ok.add(v)
    return ok


async def filter_playable(resources: list) -> list:
    """Drop video entries that YouTube won't play in our iframe."""
    vids = [_video_id_from_url(r.get("url", "")) for r in (resources or []) if r.get("type") == "video"]
    playable = await _batch_embeddable(vids)
    return [r for r in (resources or []) if r.get("type") != "video" or _video_id_from_url(r.get("url", "")) in playable]


async def is_embeddable(vid: str) -> bool:
    """True only if YouTube will actually play this video in our iframe.

    Uses the Data API status (embeddable + public/unlisted). Without a key,
    falls back to oEmbed existence (can't prove embeddability, but proves
    the video exists and isn't deleted/private).
    """
    if not vid:
        return False
    if vid in _embed_cache:
        return _embed_cache[vid]
    ok = (await _video_meta(vid)).get("embeddable", False)
    _embed_cache[vid] = ok
    return ok


async def get_video_duration(vid: str) -> int:
    """Duration in seconds (0 when unknown). Cached, 1 quota unit on miss."""
    if not vid:
        return 0
    return int((await _video_meta(vid)).get("duration_sec", 0) or 0)


async def resolve_lesson_video(
    candidate_url: str,
    node_title: str,
    lang: str,
    goal: str = "",
    exclude_url: str = "",
    objective: str = "",
    preferred_length: str = "mixed",
):
    """YouTube-only, playable, ON-TOPIC video resolution.

    Returns (video_url, video_title or None, duration_sec). Rejects
    non-YouTube URLs, non-embeddable/deleted videos AND off-topic titles
    (relevance to node title + track goal), replacing them with a ranked
    search hit. exclude_url skips the current video so "regenerate" always
    brings a DIFFERENT video about the same topic.
    Returns ("", None, 0) when nothing playable is found (the UI then shows
    "preparing" instead of a dead player).
    """
    excluded = tuple(v for v in [_video_id_from_url(exclude_url or "")] if v)
    topic = f"{node_title} {objective}".strip()
    length_target = _preferred_length_for_node(preferred_length, node_title, objective)
    candidate_fallback = None
    if _is_youtube_url(candidate_url or "") and not excluded:
        vid = _video_id_from_url(candidate_url)
        if vid:
            meta = await _video_meta(vid)
            if meta.get("embeddable") and (
                _rel_words(meta.get("title") or "") | _rel_words(meta.get("description") or "")
            ) & _rel_words(topic):
                duration = int(meta.get("duration_sec", 0) or 0)
                candidate_fallback = (candidate_url, meta.get("title"), duration)
                if length_target == "mixed" or _duration_match_score(duration, length_target):
                    return candidate_fallback
    alt = await _search_youtube_best(
        f"{node_title} {objective} {lang}".strip(),
        lang,
        8,
        must_match=topic,
        exclude=excluded,
        preferred_length=length_target,
    )
    fallback_video = None
    for v in alt:
        if await is_embeddable(v["videoId"]):
            dur = v.get("duration_sec") or await get_video_duration(v["videoId"])
            if (_rel_words(v.get("title", "")) | _rel_words(v.get("description", ""))) & _rel_words(topic):
                resolved = (v["url"], v.get("title"), int(dur or 0))
                if length_target == "mixed" or _duration_match_score(resolved[2], length_target):
                    return resolved
                if fallback_video is None:
                    fallback_video = resolved
    return fallback_video or candidate_fallback or ("", None, 0)


def _parse_views(s: str) -> int:
    try:
        s = s.lower().replace(",", "").replace("views", "").strip()
        if "m" in s:
            return int(float(s.replace("m", "")) * 1_000_000)
        if "k" in s:
            return int(float(s.replace("k", "")) * 1000)
        # Arabic: "1.2 مليون"
        if "مليون" in s:
            return int(float(re.findall(r"[\d.]+", s)[0]) * 1_000_000) if re.findall(r"[\d.]+", s) else 0
        if "ألف" in s:
            return int(float(re.findall(r"[\d.]+", s)[0]) * 1000) if re.findall(r"[\d.]+", s) else 0
        num = re.findall(r"[\d.]+", s)
        return int(float(num[0])) if num else 0
    except:
        return 0

async def _search_docs_no_key(query: str, lang: str, max_results=3):
    """Search docs via DuckDuckGo HTML without API key."""
    q = urllib.parse.quote(f"{query} documentation {'عربي' if lang=='ar' else ''}")
    url = f"https://html.duckduckgo.com/html/?q={q}"
    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "Mozilla/5.0"}) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return []
            text = r.text
            # Extract urls: <a class="result__url" href="//duckduckgo.com/l/?uddg=https://...">
            urls = re.findall(r'uddg=(https?[^&"]+)', text)
            titles = re.findall(r'class="result__a"[^>]*>([^<]+)</a>', text)
            results = []
            for idx, u in enumerate(urls):
                try:
                    u = urllib.parse.unquote(u)
                    # Prefer docs domains
                    score = 0
                    if any(d in u for d in ["developer.mozilla.org", "docs.python.org", "react.dev", "vuejs.org", "angular.io", "nodejs.org", "developer.android.com", "developer.apple.com"]):
                        score = 10
                    title = titles[idx].strip() if idx < len(titles) else query
                    results.append({"url": u, "title": title, "score": score})
                    if len(results) >= max_results * 2:
                        break
                except:
                    continue
            results.sort(key=lambda x: x["score"], reverse=True)
            return results[:max_results]
    except Exception as e:
        print(f"docs search error: {e}")
        return []

async def get_resources_for_node(node: dict, profile: dict, goal: str = "", exclude: tuple = (), force: bool = False) -> list:
    """Return resources list respecting learning_style and preferred_language.

    Videos are embed-checked (dead players never reach the UI), ranked
    (rank=1..n so the frontend readiness check works), and `exclude` skips
    already-seen videos so manual refresh always brings something new.
    force=True bypasses the 24h cache (manual "refresh" button).
    """
    lang = profile.get("preferred_language", "ar") if isinstance(profile, dict) else "ar"
    if lang not in ("ar", "en"):
        lang = "ar"
    style = profile.get("learning_style", "mixed") if isinstance(profile, dict) else "mixed"
    preferred_length = (profile.get("video_length_preference") or "mixed") if isinstance(profile, dict) else "mixed"
    if preferred_length not in ("short", "mixed", "long"):
        preferred_length = "mixed"
    # Normalize style
    if style in ("video", "visual"):
        style = "video"
    elif style in ("reading", "hands_on"):
        style = "reading"
    else:
        style = "mixed"

    node_id = node.get("id", "unknown")
    cache_key = _cache_key(node_id, lang, f"{style}:{preferred_length}")
    now = time.time()
    use_cache = not force and not exclude
    if use_cache and cache_key in _cache and now - _cache[cache_key].get("_ts", 0) < TTL:
        return _cache[cache_key]["data"]

    objective = node.get("objective", "")
    objective = objective if isinstance(objective, str) else ""
    if isinstance(node.get("skills"), list):
        objective = f"{objective} {' '.join(skill for skill in node['skills'][:4] if isinstance(skill, str))}"
    query = f"{node.get('title','')} {objective[:120]}"
    topic = f"{node.get('title','')} {objective}".strip()
    length_target = _preferred_length_for_node(preferred_length, node.get("title", ""), objective)
    excluded = set(exclude or ())
    resources = []

    try:
        if style == "video":
            vids = await _search_youtube_best(query, lang, 8 + len(excluded), must_match=topic, exclude=tuple(excluded), preferred_length=length_target)
            for v in vids:
                resources.append({"title": v["title"], "type": "video", "tier": "best_match", "url": v["url"], "duration_sec": v.get("duration_sec", 0), "duration_display": v.get("duration_display", "")})
        elif style == "reading":
            docs = await _search_docs_no_key(query, lang, 3)
            for d in docs:
                resources.append({"title": d["title"], "type": "docs", "tier": "best_match", "url": d["url"]})
        else:  # mixed -> 2+2
            vids = await _search_youtube_best(query, lang, 8 + len(excluded), must_match=topic, exclude=tuple(excluded), preferred_length=length_target)
            docs = await _search_docs_no_key(query, lang, 2)
            for v in vids:
                resources.append({"title": v["title"], "type": "video", "tier": "best_match", "url": v["url"], "duration_sec": v.get("duration_sec", 0), "duration_display": v.get("duration_display", "")})
            for d in docs:
                resources.append({"title": d["title"], "type": "docs", "tier": "best_match", "url": d["url"]})
    except Exception as e:
        print(f"get_resources error: {e}")

    # Drop dead players, then rank so frontend readiness (rank field) works
    resources = await filter_playable(resources)
    # Guarantee: every node carries at least one real YouTube video so the
    # roadmap view always has watchable embeds, whatever the style is.
    if not any(r.get("type") == "video" for r in resources):
        try:
            extra = await _search_youtube_best(query, lang, 8, must_match=topic, preferred_length=length_target)
            for v in extra:
                if await is_embeddable(v["videoId"]):
                    resources.insert(0, {"title": v["title"], "type": "video", "tier": "best_match", "url": v["url"], "duration_sec": v.get("duration_sec", 0), "duration_display": v.get("duration_display", "")})
                    break
        except Exception as e:
            print(f"video guarantee fail: {e}")
    for i, r in enumerate(resources):
        r["rank"] = i + 1

    # Cache even if empty (negative cache short)
    if use_cache:
        _cache[cache_key] = {"data": resources, "_ts": now}
    return resources
