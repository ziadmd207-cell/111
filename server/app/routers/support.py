import os
import re
import uuid
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlmodel import Session

from ..core.database import get_session
from ..core.ratelimit import check as rate_limit_check, client_key
from ..models import AdminSetting, SupportRequest

router = APIRouter()
SOCIAL_FIELDS = ("facebook_url", "linkedin_url", "instagram_url", "tiktok_url", "whatsapp_url")
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "../../../uploads")
IMAGE_TYPES = {
    ".png": b"\x89PNG\r\n\x1a\n",
    ".jpg": b"\xff\xd8\xff",
    ".jpeg": b"\xff\xd8\xff",
    ".webp": b"RIFF",
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGES = 4


def _safe_social_url(value: str | None) -> str:
    url = (value or "").strip()
    if not url:
        return ""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="Social links must be valid HTTPS URLs")
    return url


def _safe_whatsapp_url(value: str | None) -> str:
    url = _safe_social_url(value)
    if not url:
        return ""
    host = (urlparse(url).hostname or "").lower()
    if host not in {"wa.me", "www.whatsapp.com", "api.whatsapp.com"}:
        raise HTTPException(status_code=400, detail="WhatsApp link must use wa.me or whatsapp.com")
    return url


@router.post("/requests")
async def create_support_request(
    request: Request,
    email: str = Form(...),
    phone: str = Form(...),
    problem: str = Form(...),
    images: list[UploadFile] = File(default=[]),
    session: Session = Depends(get_session),
):
    if not rate_limit_check(client_key(request, "support"), limit=5, window_sec=3600):
        raise HTTPException(status_code=429, detail="Too many support requests. Please try again later.")

    email = email.strip().lower()
    phone = phone.strip()
    problem = problem.strip()
    if len(email) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    if len(phone) < 6 or len(phone) > 32 or not re.fullmatch(r"[+\d\s().-]+", phone):
        raise HTTPException(status_code=422, detail="Enter a valid phone number")
    if len(problem) < 5 or len(problem) > 3000:
        raise HTTPException(status_code=422, detail="Describe your issue in up to 3000 characters")

    if len(images) > MAX_IMAGES:
        raise HTTPException(status_code=422, detail=f"Upload no more than {MAX_IMAGES} images")
    image_data = []
    total_size = 0
    for image in images:
        ext = os.path.splitext(image.filename or "")[1].lower()
        signature = IMAGE_TYPES.get(ext)
        if not signature or len(image.filename or "") > 180:
            raise HTTPException(status_code=400, detail="Only PNG, JPG, JPEG, and WEBP images are allowed")
        content = await image.read(MAX_IMAGE_BYTES + 1)
        total_size += len(content)
        if len(content) > MAX_IMAGE_BYTES or total_size > MAX_IMAGES * MAX_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail="Each image must be no larger than 5MB")
        magic = signature
        if not content.startswith(magic) or (ext == ".webp" and content[8:12] != b"WEBP"):
            raise HTTPException(status_code=400, detail="Image content does not match its file type")
        image_data.append((ext, content))

    os.makedirs(UPLOADS_DIR, exist_ok=True)
    saved_paths = []
    try:
        for ext, content in image_data:
            filename = f"support_{uuid.uuid4().hex}{ext}"
            path = os.path.join(UPLOADS_DIR, filename)
            saved_paths.append((path, f"/uploads/{filename}"))
            with open(path, "wb") as uploaded_file:
                uploaded_file.write(content)
            try:
                os.chmod(path, 0o640)
            except OSError:
                pass
        ticket = SupportRequest(
            email=email,
            phone=phone,
            problem=problem,
            attachments=[url for _, url in saved_paths],
        )
        session.add(ticket)
        session.commit()
    except Exception:
        session.rollback()
        for path, _ in saved_paths:
            try:
                os.remove(path)
            except OSError as exc:
                print(f"Could not remove uncommitted support attachment ({type(exc).__name__})")
        raise
    session.refresh(ticket)
    return {"success": True, "id": ticket.id}


@router.get("/social-links")
def get_social_links(session: Session = Depends(get_session)):
    settings = session.get(AdminSetting, "default")
    return {
        key: (getattr(settings, key, "") or "") if settings else ""
        for key in SOCIAL_FIELDS
    }
