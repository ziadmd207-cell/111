"""Tiny in-memory sliding-window rate limiter (no new deps). Fail-open on misuse, fail-closed per-key."""
import time
from collections import defaultdict, deque

_hits: dict[str, deque] = defaultdict(deque)


def check(key: str, limit: int, window_sec: int) -> bool:
    """Return True if allowed (and record hit), False if over limit."""
    now = time.monotonic()
    q = _hits[key]
    while q and q[0] <= now - window_sec:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    # hygiene: drop empty/large structures
    if len(_hits) > 20000:
        _hits.clear()
    return True


def client_key(request, prefix: str) -> str:
    try:
        fwd = request.headers.get("x-forwarded-for", "")
        ip = (fwd.split(",")[0].strip() if fwd else "") or (request.client.host if request.client else "unknown")
    except Exception:
        ip = "unknown"
    return f"{prefix}:{ip}"
