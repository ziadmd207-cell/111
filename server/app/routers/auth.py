"""
Real auth endpoints:
POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
"""
import re
from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlmodel import Session, func, select

from ..core.ratelimit import check as _rl_check, client_key as _rl_key

from ..core.database import get_session
from ..core.deps import get_current_user, get_user_subscription_info
from ..core.security import create_access_token, hash_password, verify_password
from ..core.phone import normalize_phone
from ..models import PartnerMember, User

router = APIRouter()

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _public_user(user: User, session: Session) -> dict:
    sub_info = get_user_subscription_info(user, session)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone_country": user.phone_country,
        "phone_country_code": user.phone_country_code,
        "phone_number": user.phone_number,
        "phone_e164": user.phone_e164,
        "avatar_url": getattr(user, "avatar_url", None),
        "google_id": bool(getattr(user, "google_id", None)),
        "role": getattr(user, "role", "user") or "user",
        "status": getattr(user, "status", "active") or "active",
        "subscription_plan": sub_info.get("plan"),
        "subscription_status": sub_info.get("status"),
        "subscription_expires": sub_info.get("expires_at"),
        "tier": sub_info.get("tier", "NONE"),
        "remaining_days": sub_info.get("remaining_days", 0),
        "is_subscription_active": sub_info.get("is_active", False),
        "subscription": sub_info,
    }


def _ensure_active(user: User):
    status = getattr(user, "status", "active") or "active"
    if status == "suspended":
        raise HTTPException(
            status_code=403,
            detail="🚫 حسابك اتوقف مؤقتًا من الإدارة — لو شايف ده غلط تواصل معنا وهنراجع حسابك فورًا.",
        )
    if status == "pending":
        raise HTTPException(
            status_code=403,
            detail="⏳ حسابك بانتظار تفعيل الأدمن — هنبعتلك إشعار أول ما يتقبل وتقدر تبدأ رحلتك.",
        )


@router.post("/register")
def register(data: dict = Body(...), session: Session = Depends(get_session), request: Request = None):
    if request is not None and not _rl_check(_rl_key(request, "register"), 10, 600):
        raise HTTPException(status_code=429, detail="Too many attempts — try again later")
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    full_name = (data.get("full_name") or "").strip() or None
    try:
        phone = normalize_phone(data.get("phone_country"), data.get("phone_number"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not _EMAIL_RE.match(email) or len(email) > 254:
        raise HTTPException(status_code=400, detail="Invalid email address")
    if len(password) < 6 or len(password) > 72:
        raise HTTPException(status_code=400, detail="Password must be 6-72 characters")
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    existing_phone = session.exec(select(User).where(User.phone_e164 == phone["phone_e164"])).first()
    if existing_phone:
        raise HTTPException(status_code=400, detail="رقم الهاتف مسجل بالفعل.")
    # New accounts start as pending: admin must approve + assign a plan first.
    # No token is issued here so the account cannot enter by any method.
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        **phone,
        status="pending",
        subscription_status="none",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"user": _public_user(user, session), "pending": True, "message": "Account created — waiting for admin activation"}


@router.post("/login")
def login(data: dict = Body(...), session: Session = Depends(get_session), request: Request = None):
    if request is not None and not _rl_check(_rl_key(request, "login"), 20, 600):
        raise HTTPException(status_code=429, detail="Too many attempts — try again later")
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if len(password) > 72:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        membership = session.exec(
            select(PartnerMember).where(func.lower(PartnerMember.username) == email.lower())
        ).first()
        if membership:
            user = session.get(User, membership.user_id)
    if not user or not verify_password(password, user.password_hash or ""):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _ensure_active(user)
    if user.role in {"partner", "doctor", "partner_student"}:
        sub_info = get_user_subscription_info(user, session)
        if not sub_info.get("is_active"):
            raise HTTPException(status_code=403, detail="Partner access is inactive or its subscription has expired.")
    return {"access_token": create_access_token(user.id), "user": _public_user(user, session)}


@router.get("/me")
def me(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    _ensure_active(user)
    return _public_user(user, session)
