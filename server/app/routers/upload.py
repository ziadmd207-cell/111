from fastapi import APIRouter, UploadFile, File, Depends
import os
import uuid
import shutil
from ..core.deps import get_current_user_id

router = APIRouter()

# Must match the StaticFiles mount in main.py (app/../../uploads → repo root,
# /app/uploads in Docker where the uploads volume is mounted).
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "../../../uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".txt", ".md"}
MAX_BYTES = 10 * 1024 * 1024

# Magic-byte signatures (first bytes) per type — extension alone is not trusted.
MAGIC = {
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".webp": [b"RIFF"],
    ".gif": [b"GIF87a", b"GIF89a"],
    ".pdf": [b"%PDF-"],
}


def _sniff_ok(head: bytes, ext: str) -> bool:
    if ext in MAGIC:
        return any(head.startswith(sig) for sig in MAGIC[ext])
    if ext in (".txt", ".md"):
        # Reject HTML/SVG/JS polyglots and null bytes in "text" uploads.
        low = head[:2048].lower()
        if b"\x00" in head[:2048]:
            return False
        for bad in (b"<html", b"<!doctype html", b"<script", b"<svg", b"<?php", b"<%"):
            if bad in low:
                return False
        return True
    return False


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
    ext = (os.path.splitext(file.filename or "")[1] or ".bin").lower()
    if ext not in ALLOWED_EXTS:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="File type not allowed")
    if len(file.filename or "") > 180:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Filename too long")
    fname = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(UPLOADS_DIR, fname)
    size = 0
    head = b""
    with open(dest, "wb") as buffer:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BYTES:
                buffer.close()
                try:
                    os.remove(dest)
                except OSError:
                    pass
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail="File too large (max 10MB)")
            if len(head) < 2048:
                head += chunk[: 2048 - len(head)]
            buffer.write(chunk)
    if not _sniff_ok(head, ext):
        try:
            os.remove(dest)
        except OSError:
            pass
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="File content does not match its type")
    try:
        os.chmod(dest, 0o640)
    except OSError:
        pass
    # Return URL relative to server; frontend will prefix with API base
    return {"file_url": f"/uploads/{fname}", "url": f"/uploads/{fname}"}

# Alias for Base44 compatibility: /api/integrations/Core/UploadPublicFile
@router.post("/integrations/Core/UploadPublicFile")
async def upload_public_file(file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
    return await upload_file(file, user_id)
