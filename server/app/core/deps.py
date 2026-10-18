"""Real auth dependencies: user identity comes from the Bearer token."""
from datetime import datetime
from fastapi import Depends, Header, HTTPException
from sqlmodel import Session

from .database import get_session
from .security import decode_access_token

TIER_RANKS = {
    "NONE": 0,
    "STARTER": 1,
    "PRO": 2,
    "PRIME": 3,
}


def get_current_user_id(
    authorization: str = Header(default=""),
    session: Session = Depends(get_session),
) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = decode_access_token(authorization[len("Bearer "):].strip())
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    from ..models import User

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    st = getattr(user, "status", "active") or "active"
    if st == "suspended":
        raise HTTPException(
            status_code=403,
            detail="🚫 حسابك اتوقف مؤقتًا من الإدارة — لو شايف ده غلط تواصل معنا وهنراجع حسابك فورًا.",
        )
    if st != "active":
        raise HTTPException(
            status_code=403,
            detail="⏳ حسابك بانتظار تفعيل الأدمن — هنبعتلك إشعار أول ما يتقبل وتقدر تبدأ رحلتك.",
        )
    return user_id


def get_optional_user_id(authorization: str = Header(default="")) -> str | None:
    if not authorization.startswith("Bearer "):
        return None
    return decode_access_token(authorization[len("Bearer "):].strip())


def get_current_user(
    user_id: str = Depends(get_current_user_id),
    session: Session = Depends(get_session),
):
    from ..models import User

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(
    user_id: str = Depends(get_current_user_id),
    session: Session = Depends(get_session),
):
    """Gate for /api/admin/* — 403 unless the token belongs to an admin."""
    from ..models import User

    user = session.get(User, user_id)
    if not user or getattr(user, "role", "user") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def get_user_subscription_info(user, session: Session) -> dict:
    """Return normalized subscription details, automatically checking expiration."""
    if not user:
        return {"plan": None, "status": "none", "tier": "NONE", "is_active": False, "remaining_days": 0}

    # Admins get unlimited access to all features (PRIME equivalent)
    if getattr(user, "role", "user") == "admin":
        return {
            "plan": "PRIME",
            "status": "active",
            "tier": "PRIME",
            "is_active": True,
            "is_admin": True,
            "start_date": None,
            "expires_at": None,
            "remaining_days": 9999,
        }

    plan = (getattr(user, "subscription_plan", None) or "").strip().upper()
    status = getattr(user, "subscription_status", "none") or "none"
    expires = getattr(user, "subscription_expires", None)
    starts = getattr(user, "subscription_start", None)

    now = datetime.utcnow()
    # Check automatic expiration
    if expires and expires <= now:
        if status == "active":
            user.subscription_status = "expired"
            session.add(user)
            session.commit()
            session.refresh(user)
        return {
            "plan": plan,
            "status": "expired",
            "tier": "NONE",
            "is_active": False,
            "is_expired": True,
            "start_date": starts.isoformat() if starts else None,
            "expires_at": expires.isoformat() if expires else None,
            "remaining_days": 0,
        }

    if status == "active" and plan in ("STARTER", "PRO", "PRIME"):
        remaining_days = (expires - now).days if expires else 30
        return {
            "plan": plan,
            "status": "active",
            "tier": plan,
            "is_active": True,
            "is_expired": False,
            "start_date": starts.isoformat() if starts else None,
            "expires_at": expires.isoformat() if expires else None,
            "remaining_days": max(0, remaining_days),
        }

    return {
        "plan": None,
        "status": status,
        "tier": "NONE",
        "is_active": False,
        "is_expired": False,
        "start_date": None,
        "expires_at": None,
        "remaining_days": 0,
    }


def require_tier(min_tier: str):
    """Enforces minimum subscription tier requirement for an endpoint."""
    def dependency(user=Depends(get_current_user), session: Session = Depends(get_session)):
        info = get_user_subscription_info(user, session)
        user_tier = info.get("tier", "NONE")
        user_rank = TIER_RANKS.get(user_tier, 0)
        min_rank = TIER_RANKS.get(min_tier.upper(), 0)

        if user_rank < min_rank:
            status = info.get("status", "none")
            if status == "expired":
                detail_msg = f"Subscription expired. Please renew your {min_tier} plan to access this feature."
            else:
                detail_msg = f"Access denied. This feature requires an active {min_tier} plan."
            raise HTTPException(
                status_code=403,
                detail=detail_msg,
                headers={"X-Required-Tier": min_tier, "X-Current-Tier": user_tier},
            )
        return user
    return dependency
