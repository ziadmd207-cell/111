"""Real auth dependencies: user identity comes from the Bearer token."""
from datetime import datetime, timedelta
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
            headers={"X-Account-Status": "suspended"},
        )
    if st != "active":
        raise HTTPException(
            status_code=403,
            detail="⏳ حسابك بانتظار تفعيل الأدمن — هنبعتلك إشعار أول ما يتقبل وتقدر تبدأ رحلتك.",
            headers={"X-Account-Status": "pending"},
        )
    role = getattr(user, "role", "user")
    if role in {"partner", "doctor", "partner_student"}:
        info = get_user_subscription_info(user, session)
        if not info.get("is_active"):
            raise HTTPException(
                status_code=403,
                detail="Partner access is inactive or its subscription has expired.",
                headers={"X-Subscription-Status": "inactive"},
            )
        return user_id
    if role != "admin":
        now = datetime.utcnow()
        plan = (getattr(user, "subscription_plan", None) or "").strip().upper()
        subscription_status = getattr(user, "subscription_status", "none") or "none"
        starts = getattr(user, "subscription_start", None)
        expires = getattr(user, "subscription_expires", None)
        subscription_active = (
            subscription_status == "active"
            and plan in ("STARTER", "PRO", "PRIME")
            and (not starts or starts <= now)
            and (not expires or expires > now)
        )
        if not subscription_active:
            if expires and expires <= now and subscription_status == "active":
                user.subscription_status = "expired"
                session.add(user)
                session.commit()
            raise HTTPException(
                status_code=403,
                detail="انتهى اشتراكك أو تم إيقافه. سجّل الدخول بعد تجديد الاشتراك.",
                headers={"X-Subscription-Status": "inactive"},
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


def ensure_subscription_expiry_notification(user, session: Session, now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    plan = (getattr(user, "subscription_plan", None) or "").strip().upper()
    expires = getattr(user, "subscription_expires", None)
    starts = getattr(user, "subscription_start", None)
    if (
        getattr(user, "subscription_status", "none") != "active"
        or plan not in ("STARTER", "PRO", "PRIME")
        or not expires
        or (starts and starts > now)
        or not timedelta(0) < expires - now <= timedelta(days=5)
    ):
        return False

    import uuid
    from ..models import Notification

    notification_id = str(uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"zeus:subscription-expiry:{user.id}:{expires.isoformat()}",
    ))
    if session.get(Notification, notification_id):
        return False

    expiry_date = expires.strftime("%Y-%m-%d")
    session.add(Notification(
        id=notification_id,
        user_id=user.id,
        type="subscription_expiry",
        title="اشتراكك قرب يخلص | Your plan is expiring soon",
        body=(
            f"باقي 5 أيام أو أقل على انتهاء باقة {plan} بتاريخ {expiry_date}. جدد اشتراكك عشان تفضل محتفظ بمميزات الباقة. "
            f"Your {plan} plan expires on {expiry_date}. Renew to keep its features."
        ),
        action_label="تجديد الاشتراك | Renew",
        action_url="/subscriptions",
        created_date=now,
        updated_date=now,
    ))
    return True


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

    role = getattr(user, "role", "user")
    if role in {"partner", "doctor", "partner_student"}:
        from sqlmodel import select
        from ..models import Partner, PartnerMember

        if role == "partner":
            partner = session.exec(
                select(Partner).where(Partner.account_user_id == user.id)
            ).first()
            membership = None
        else:
            membership = session.exec(
                select(PartnerMember).where(
                    PartnerMember.user_id == user.id,
                    PartnerMember.status == "active",
                )
            ).first()
            if membership and (
                (role == "doctor" and membership.member_type != "doctor")
                or (role == "partner_student" and membership.member_type != "student")
            ):
                membership = None
            partner = session.get(Partner, membership.partner_id) if membership else None

        now = datetime.utcnow()
        active = bool(
            partner
            and partner.status == "active"
            and partner.subscription_status == "active"
            and partner.subscription_plan in ("STARTER", "PRO", "PRIME")
            and (not partner.subscription_start or partner.subscription_start <= now)
            and (not partner.subscription_expires or partner.subscription_expires > now)
            and (role == "partner" or (membership and membership.status == "active"))
        )
        plan = partner.subscription_plan if partner else None
        features = partner.features if partner and isinstance(partner.features, dict) else {}
        if active:
            expires = partner.subscription_expires
            return {
                "plan": plan,
                "status": "active",
                "tier": plan,
                "is_active": True,
                "is_expired": False,
                "partner_managed": True,
                "partner_id": partner.id,
                "features": features,
                "start_date": partner.subscription_start.isoformat() if partner.subscription_start else None,
                "expires_at": expires.isoformat() if expires else None,
                "remaining_days": max(0, (expires - now).days) if expires else 30,
            }
        status = "expired" if partner and partner.subscription_expires and partner.subscription_expires <= now else "none"
        return {
            "plan": plan,
            "status": status,
            "tier": "NONE",
            "is_active": False,
            "is_expired": status == "expired",
            "partner_managed": True,
            "partner_id": partner.id if partner else None,
            "features": features,
            "start_date": partner.subscription_start.isoformat() if partner and partner.subscription_start else None,
            "expires_at": partner.subscription_expires.isoformat() if partner and partner.subscription_expires else None,
            "remaining_days": 0,
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

    if starts and starts > now:
        return {
            "plan": plan or None,
            "status": "scheduled",
            "tier": "NONE",
            "is_active": False,
            "is_expired": False,
            "start_date": starts.isoformat(),
            "expires_at": expires.isoformat() if expires else None,
            "remaining_days": max(0, (starts - now).days),
        }

    if status == "active" and plan in ("STARTER", "PRO", "PRIME"):
        remaining_days = (expires - now).days if expires else 30
        if ensure_subscription_expiry_notification(user, session, now):
            from sqlalchemy.exc import IntegrityError
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
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


def partner_feature_enabled(user, session: Session, feature: str) -> bool:
    """Apply partner feature overrides while leaving individual accounts unchanged."""
    info = get_user_subscription_info(user, session)
    if not info.get("partner_managed"):
        return True
    defaults = {
        "STARTER": {"learning"},
        "PRO": {"learning", "statistics", "projects"},
        "PRIME": {"learning", "statistics", "community", "projects", "cv", "portfolio", "career", "certificates"},
    }
    configured = info.get("features") or {}
    allowed = configured.get(feature, feature in defaults.get(info.get("plan"), set()))
    if feature == "learning":
        return bool(allowed)
    return bool(allowed)


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
