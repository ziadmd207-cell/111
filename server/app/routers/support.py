import os
import logging
import re
import uuid
from datetime import datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from ..core.database import get_session
from ..core.deps import get_current_user_id
from ..core.ratelimit import check as rate_limit_check, client_key
from ..models import AdminSetting, SupportChat, SupportChatMessage, SupportRequest, User

router = APIRouter()
logger = logging.getLogger(__name__)
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
MAX_CHAT_ATTACHMENTS = 4
MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024
CHAT_FILE_TYPES = {
    ".png": ("image/png", b"\x89PNG\r\n\x1a\n"),
    ".jpg": ("image/jpeg", b"\xff\xd8\xff"),
    ".jpeg": ("image/jpeg", b"\xff\xd8\xff"),
    ".webp": ("image/webp", b"RIFF"),
    ".gif": ("image/gif", b"GIF8"),
    ".mp3": ("audio/mpeg", b"ID3"),
    ".wav": ("audio/wav", b"RIFF"),
    ".ogg": ("audio/ogg", b"OggS"),
    ".webm": ("audio/webm", b"\x1aE\xdf\xa3"),
    ".m4a": ("audio/mp4", b"\x00\x00"),
    ".mp4": ("video/mp4", b"\x00\x00"),
    ".pdf": ("application/pdf", b"%PDF-"),
}


def _delete_chat_attachments(messages: list[SupportChatMessage]) -> None:
    for message in messages:
        for attachment in message.attachments or []:
            if not isinstance(attachment, dict):
                continue
            filename = os.path.basename(str(attachment.get("url") or "").replace("\\", "/"))
            if not filename.startswith("support_chat_"):
                continue
            try:
                os.remove(os.path.join(UPLOADS_DIR, filename))
            except FileNotFoundError:
                continue
            except OSError:
                logger.warning("Could not remove support chat attachment %s", filename, exc_info=True)


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


async def _save_chat_attachments(files: list[UploadFile]) -> list[dict]:
    if len(files) > MAX_CHAT_ATTACHMENTS:
        raise HTTPException(status_code=422, detail=f"Upload no more than {MAX_CHAT_ATTACHMENTS} files")
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    saved = []
    try:
        for upload in files:
            ext = os.path.splitext(upload.filename or "")[1].lower()
            file_type = CHAT_FILE_TYPES.get(ext)
            if not file_type or len(upload.filename or "") > 180:
                raise HTTPException(status_code=400, detail="Unsupported support attachment type")
            mime_type, signature = file_type
            content = await upload.read(MAX_CHAT_FILE_BYTES + 1)
            if not content or len(content) > MAX_CHAT_FILE_BYTES:
                raise HTTPException(status_code=400, detail="Each support attachment must be 10MB or smaller")
            if ext in {".m4a", ".mp4"}:
                valid_signature = content[4:8] == b"ftyp"
            elif ext == ".wav":
                valid_signature = content.startswith(b"RIFF") and content[8:12] == b"WAVE"
            elif ext == ".webp":
                valid_signature = content.startswith(b"RIFF") and content[8:12] == b"WEBP"
            elif ext == ".mp3":
                valid_signature = content.startswith(b"ID3") or (
                    len(content) > 1 and content[0] == 0xFF and content[1] & 0xE0 == 0xE0
                )
            else:
                valid_signature = content.startswith(signature)
            if not valid_signature:
                raise HTTPException(status_code=400, detail="Attachment content does not match its file type")
            filename = f"support_chat_{uuid.uuid4().hex}{ext}"
            path = os.path.join(UPLOADS_DIR, filename)
            with open(path, "wb") as target:
                target.write(content)
            try:
                os.chmod(path, 0o640)
            except OSError:
                pass
            url = f"/uploads/{filename}"
            saved.append({
                "url": url,
                "name": os.path.basename((upload.filename or filename).replace("\\", "/")),
                "mime_type": mime_type,
                "size": len(content),
            })
    except Exception:
        for item in saved:
            try:
                os.remove(os.path.join(UPLOADS_DIR, os.path.basename(item["url"])))
            except OSError:
                pass
        raise
    return saved


def _chat_dump(chat: SupportChat) -> dict:
    return chat.model_dump()


def _message_dump(message: SupportChatMessage) -> dict:
    result = message.model_dump()
    for attachment in result.get("attachments", []):
        filename = os.path.basename(attachment.get("url", ""))
        if filename.startswith("support_chat_"):
            attachment["url"] = f"/api/support/chats/attachments/{filename}"
    return result


@router.get("/chats/attachments/{filename}")
def get_chat_attachment(
    filename: str,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
):
    if not re.fullmatch(r"support_chat_[0-9a-f]{32}\.[a-z0-9]+", filename):
        raise HTTPException(status_code=404, detail="Attachment not found")

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    query = select(SupportChatMessage.attachments).join(
        SupportChat, SupportChat.id == SupportChatMessage.chat_id
    )
    if getattr(user, "role", "user") != "admin":
        query = query.where(SupportChat.user_id == user_id)

    referenced = any(
        os.path.basename(item.get("url", "")) == filename
        for attachments in session.exec(query).all()
        for item in (attachments or [])
    )
    if not referenced:
        raise HTTPException(status_code=404, detail="Attachment not found")

    path = os.path.abspath(os.path.join(UPLOADS_DIR, filename))
    if os.path.commonpath((os.path.abspath(UPLOADS_DIR), path)) != os.path.abspath(UPLOADS_DIR):
        raise HTTPException(status_code=404, detail="Attachment not found")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Attachment not found")

    import mimetypes

    media_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type, headers={"Content-Disposition": "inline"})


def _get_or_create_user_chat(user_id: str, session: Session) -> SupportChat:
    chat = session.exec(
        select(SupportChat)
        .where(SupportChat.user_id == user_id)
        .order_by(SupportChat.updated_date.desc())
        .limit(1)
    ).first()
    if chat:
        return chat
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    now = datetime.utcnow()
    chat = SupportChat(
        user_id=user.id,
        name=(user.full_name or user.email).strip(),
        email=user.email,
        phone="",
        status="open",
        unread_admin=0,
        unread_user=0,
        created_date=now,
        updated_date=now,
    )
    session.add(chat)
    session.commit()
    session.refresh(chat)
    return chat


@router.get("/chats/me")
def get_my_support_chat(
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
):
    chat = _get_or_create_user_chat(user_id, session)
    messages = session.exec(
        select(SupportChatMessage)
        .where(SupportChatMessage.chat_id == chat.id)
        .order_by(SupportChatMessage.created_date)
    ).all()
    chat.unread_user = 0
    session.add(chat)
    response = {
        "chat": _chat_dump(chat),
        "messages": [_message_dump(item) for item in messages],
    }
    session.commit()
    return response


@router.post("/chats/me/messages")
async def send_my_support_message(
    request: Request,
    text: str = Form(default=""),
    files: list[UploadFile] = File(default=[]),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
):
    if not rate_limit_check(client_key(request, "support-chat"), limit=60, window_sec=300):
        raise HTTPException(status_code=429, detail="Too many messages. Please try again later.")
    text = text.strip()
    if len(text) > 3000:
        raise HTTPException(status_code=422, detail="Message must be 3000 characters or fewer")
    if not text and not files:
        raise HTTPException(status_code=422, detail="Write a message or attach a file")

    attachments = await _save_chat_attachments(files)
    chat = _get_or_create_user_chat(user_id, session)
    now = datetime.utcnow()
    message = SupportChatMessage(
        chat_id=chat.id,
        sender_type="user",
        sender_user_id=user_id,
        text=text,
        attachments=attachments,
        created_date=now,
    )
    chat.status = "open"
    chat.unread_admin += 1
    chat.updated_date = now
    session.add(message)
    session.add(chat)
    try:
        session.commit()
        session.refresh(message)
        session.refresh(chat)
    except Exception:
        session.rollback()
        for item in attachments:
            try:
                os.remove(os.path.join(UPLOADS_DIR, os.path.basename(item["url"])))
            except OSError:
                pass
        raise
    return {"chat": _chat_dump(chat), "message": _message_dump(message)}


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
