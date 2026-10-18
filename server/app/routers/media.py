"""Media proxy to hide external sources - PDF via proxy, videos via nocookie embed."""
from urllib.parse import quote
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
import httpx

from ..core.deps import get_current_user_id
from ..core.ssrf import validate_fetch_url

router = APIRouter()

MAX_PROXY_BYTES = 5 * 1024 * 1024


@router.get("/media/pdf")
async def proxy_pdf(url: str = Query(...), user_id: str = Depends(get_current_user_id)):
    """Proxy PDF/docs to hide external source. Auth required, SSRF-guarded."""
    try:
        safe_url = validate_fetch_url(url)
    except ValueError:
        raise HTTPException(status_code=400, detail="URL not allowed")
    try:
        async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=False) as client:
            r = await client.get(safe_url)
            if r.status_code in (301, 302, 303, 307, 308):
                loc = r.headers.get("location", "")
                try:
                    safe_url = validate_fetch_url(loc)
                except ValueError:
                    return JSONResponse({"error": "PDF غير متاح حالياً، جرّب تاني 🙏"}, status_code=502)
                r = await client.get(safe_url)
            if r.status_code != 200:
                return JSONResponse({"error": "PDF غير متاح حالياً، جرّب تاني 🙏"}, status_code=502)
            body = r.content
            if len(body) > MAX_PROXY_BYTES:
                return JSONResponse({"error": "PDF غير متاح حالياً، جرّب تاني 🙏"}, status_code=502)
            ctype = r.headers.get("content-type", "application/pdf")
            if "pdf" not in ctype and "html" not in ctype:
                return JSONResponse({"error": "PDF غير متاح حالياً، جرّب تاني 🙏"}, status_code=502)
            return StreamingResponse(
                iter([body]),
                media_type="application/pdf",
                headers={
                    "Content-Disposition": "inline",
                    "Cache-Control": "public, max-age=86400",
                    "X-Content-Type-Options": "nosniff",
                },
            )
    except HTTPException:
        raise
    except Exception as e:
        print("pdf proxy fail")
        return JSONResponse({"error": "حصل خطأ صغير، جرّب تاني 🙏"}, status_code=500)


@router.get("/media/oembed")
async def oembed_check(url: str = Query(...), user_id: str = Depends(get_current_user_id)):
    """Validate YouTube video is playable (oEmbed). Auth required."""
    try:
        safe_url = validate_fetch_url(url)
    except ValueError:
        return {"valid": False}
    if "youtube.com" not in safe_url and "youtu.be" not in safe_url:
        return {"valid": False}
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
            r = await client.get(f"https://www.youtube.com/oembed?url={quote(safe_url, safe='')}&format=json")
            if r.status_code == 200:
                j = r.json()
                return {"valid": True, "title": j.get("title", "")}
            return {"valid": False}
    except Exception:
        return {"valid": False}
