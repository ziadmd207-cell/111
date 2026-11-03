import os
import re
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select, func

from ..core.database import get_session
from ..core.deps import get_current_user_id, require_admin
from ..models import Certificate, Notification, User

router = APIRouter()

CERTIFICATES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../uploads/certificates")
)
MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024
ALLOWED_CERTIFICATE_TYPES = {
    ".pdf": ("application/pdf", b"%PDF-"),
    ".png": ("image/png", b"\x89PNG\r\n\x1a\n"),
    ".jpg": ("image/jpeg", b"\xff\xd8\xff"),
    ".jpeg": ("image/jpeg", b"\xff\xd8\xff"),
}


def _certificate_path(certificate: Certificate) -> str:
    key = os.path.basename(certificate.file_key or "")
    if not key or key != certificate.file_key:
        raise HTTPException(status_code=404, detail="Certificate file not found")
    path = os.path.abspath(os.path.join(CERTIFICATES_DIR, key))
    if os.path.commonpath((CERTIFICATES_DIR, path)) != CERTIFICATES_DIR or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Certificate file not found")
    return path


def _remove_certificate_file(certificate: Certificate) -> None:
    key = os.path.basename(certificate.file_key or "")
    if key and key == certificate.file_key:
        path = os.path.abspath(os.path.join(CERTIFICATES_DIR, key))
        if os.path.commonpath((CERTIFICATES_DIR, path)) == CERTIFICATES_DIR:
            try:
                os.remove(path)
            except FileNotFoundError:
                pass


def _certificate_dump(certificate: Certificate, user: User | None = None) -> dict:
    result = {
        "id": certificate.id,
        "title": certificate.title,
        "file_name": certificate.file_name,
        "media_type": certificate.media_type,
        "created_date": certificate.created_date.isoformat(),
        "share_url": f"/certificate/{certificate.share_token}",
    }
    if user:
        result.update({
            "user_id": user.id,
            "full_name": user.full_name,
            "email": user.email,
        })
    return result


@router.post("/admin/certificates")
async def admin_send_certificate(
    recipient_email: str = Form(...),
    title: str = Form(default=""),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    email = recipient_email.strip().lower()
    if not email or len(email) > 320 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=400, detail="Enter a valid recipient email")
    recipient = session.exec(select(User).where(func.lower(User.email) == email)).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="No account was found for this email")

    clean_title = title.strip()[:160] or "ZEUS Certificate"
    original_name = os.path.basename(file.filename or "certificate")
    if len(original_name) > 180:
        raise HTTPException(status_code=400, detail="Filename too long")
    extension = os.path.splitext(original_name)[1].lower()
    file_type = ALLOWED_CERTIFICATE_TYPES.get(extension)
    if not file_type:
        raise HTTPException(status_code=400, detail="Only PDF, PNG, and JPG certificates are supported")

    os.makedirs(CERTIFICATES_DIR, exist_ok=True)
    file_key = f"{uuid.uuid4().hex}{extension}"
    destination = os.path.join(CERTIFICATES_DIR, file_key)
    size = 0
    head = b""
    try:
        with open(destination, "wb") as target:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_CERTIFICATE_BYTES:
                    raise HTTPException(status_code=400, detail="Certificate file exceeds 10 MB")
                if len(head) < 16:
                    head += chunk[:16 - len(head)]
                target.write(chunk)
        if not head.startswith(file_type[1]):
            raise HTTPException(status_code=400, detail="File content does not match its type")
        try:
            os.chmod(destination, 0o640)
        except OSError:
            pass

        certificate = Certificate(
            user_id=recipient.id,
            sent_by_user_id=admin.id,
            title=clean_title,
            file_key=file_key,
            file_name=original_name,
            media_type=file_type[0],
        )
        session.add(certificate)
        session.add(Notification(
            user_id=recipient.id,
            type="certificate",
            title="وصلتك شهادة جديدة | You received a certificate",
            body=clean_title,
            action_label="عرض الشهادة",
            action_url="/certificates",
        ))
        session.commit()
        session.refresh(certificate)
        return {"certificate": _certificate_dump(certificate, recipient)}
    except Exception:
        if os.path.exists(destination):
            os.remove(destination)
        raise


@router.get("/admin/certificates")
def admin_list_certificates(
    search: str = Query(default="", max_length=200),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    statement = (
        select(Certificate, User)
        .join(User, User.id == Certificate.user_id)
        .order_by(Certificate.created_date.desc())
        .limit(1000)
    )
    term = search.strip()
    if term:
        pattern = f"%{term}%"
        statement = statement.where(
            (User.full_name.ilike(pattern)) | (User.email.ilike(pattern))
        )
    rows = session.exec(statement).all()
    return {
        "certificates": [_certificate_dump(certificate, user) for certificate, user in rows],
        "total": len(rows),
    }


@router.get("/certificates")
def user_list_certificates(
    user_id: str = Depends(get_current_user_id),
    session: Session = Depends(get_session),
):
    certificates = session.exec(
        select(Certificate)
        .where(Certificate.user_id == user_id)
        .order_by(Certificate.created_date.desc())
    ).all()
    return {"certificates": [_certificate_dump(item) for item in certificates]}


@router.get("/certificates/{certificate_id}/file")
def user_certificate_file(
    certificate_id: str,
    user_id: str = Depends(get_current_user_id),
    session: Session = Depends(get_session),
):
    certificate = session.get(Certificate, certificate_id)
    if not certificate or certificate.user_id != user_id:
        raise HTTPException(status_code=404, detail="Certificate not found")
    return FileResponse(
        _certificate_path(certificate),
        media_type=certificate.media_type,
        filename=certificate.file_name,
        content_disposition_type="attachment",
        headers={"Cache-Control": "private, no-store"},
    )


@router.get("/certificates/share/{share_token}")
def public_certificate(
    share_token: str,
    session: Session = Depends(get_session),
):
    certificate = session.exec(
        select(Certificate).where(Certificate.share_token == share_token)
    ).first()
    if not certificate:
        raise HTTPException(status_code=404, detail="Certificate not found")
    return _certificate_dump(certificate)


@router.get("/certificates/share/{share_token}/file")
def public_certificate_file(
    share_token: str,
    download: bool = False,
    session: Session = Depends(get_session),
):
    certificate = session.exec(
        select(Certificate).where(Certificate.share_token == share_token)
    ).first()
    if not certificate:
        raise HTTPException(status_code=404, detail="Certificate not found")
    return FileResponse(
        _certificate_path(certificate),
        media_type=certificate.media_type,
        filename=certificate.file_name,
        content_disposition_type="attachment" if download else "inline",
        headers={"Cache-Control": "private, no-store"},
    )
