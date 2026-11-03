"""
Subscription router:
GET /api/subscriptions/plans - Public dynamic plans & prices from database
POST /api/subscriptions/submit - Submit payment proof for review
GET /api/subscriptions/my-status - User's active subscription tier & expiration
"""
from datetime import datetime
import os
import re
import uuid
from fastapi import APIRouter, Body, Depends, HTTPException, Request, UploadFile, File
from sqlmodel import Session, select
from typing import Optional

_AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
_EGYPT_MOBILE_RE = re.compile(r"^01[0125][0-9]{8}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_NAME_RE = re.compile(r"^[\w .'\-ـ\u0600-\u06FF]+$", re.UNICODE)


def _normalize_phone(raw: str) -> str:
    s = (raw or "").strip().translate(_AR_DIGITS)
    s = re.sub(r"[\s\-().]", "", s)
    if s.startswith("+20"):
        s = "0" + s[3:]
    elif s.startswith("0020"):
        s = "0" + s[4:]
    return s

from ..core.database import get_session
from ..core.deps import get_optional_user_id, get_current_user, get_user_subscription_info
from ..core.ratelimit import check as _rl_check, client_key as _rl_key
from ..models import AdminSetting, SubscriptionRequest, User

router = APIRouter()

# Receipt uploads must work for pending users who cannot log in yet, so this
# endpoint is PUBLIC (no auth) but tightly restricted: receipt images only,
# 5MB max, magic-byte verified, rate-limited per IP.
RECEIPT_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
RECEIPT_MAGIC = {
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".webp": [b"RIFF"],
}
RECEIPT_MAX_BYTES = 5 * 1024 * 1024
_UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "../../../uploads")


@router.post("/upload-receipt")
async def upload_receipt(file: UploadFile = File(...), request: Request = None):
    if request is not None and not _rl_check(_rl_key(request, "receipt"), 20, 600):
        raise HTTPException(status_code=429, detail="طلبات كتير — استنى شوية وحاول تاني")
    ext = (os.path.splitext(file.filename or "")[1] or "").lower()
    if ext not in RECEIPT_EXTS:
        raise HTTPException(status_code=400, detail="مسموح صور الإيصال فقط (PNG أو JPG)")
    if len(file.filename or "") > 180:
        raise HTTPException(status_code=400, detail="اسم الملف طويل جدًا")
    os.makedirs(_UPLOADS_DIR, exist_ok=True)
    fname = f"receipt_{uuid.uuid4().hex}{ext}"
    dest = os.path.join(_UPLOADS_DIR, fname)
    size = 0
    head = b""
    with open(dest, "wb") as buffer:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > RECEIPT_MAX_BYTES:
                buffer.close()
                try:
                    os.remove(dest)
                except OSError:
                    pass
                raise HTTPException(status_code=400, detail="الصورة كبيرة — الحد الأقصى 5MB")
            if len(head) < 16:
                head += chunk[: 16 - len(head)]
            buffer.write(chunk)
    if not any(head.startswith(sig) for sig in RECEIPT_MAGIC[ext]):
        try:
            os.remove(dest)
        except OSError:
            pass
        raise HTTPException(status_code=400, detail="الملف مش صورة صالحة")
    try:
        os.chmod(dest, 0o640)
    except OSError:
        pass
    return {"file_url": f"/uploads/{fname}", "url": f"/uploads/{fname}"}


def _get_or_create_settings(session: Session) -> AdminSetting:
    setting = session.get(AdminSetting, "default")
    if not setting:
        setting = AdminSetting(id="default")
        session.add(setting)
        session.commit()
        session.refresh(setting)
    return setting


@router.get("/plans")
def get_subscription_plans(session: Session = Depends(get_session)):
    """Single source of truth for subscription plans and pricing."""
    setting = _get_or_create_settings(session)
    defaults = {
        "STARTER": {
            "description": {"ar": "خطة البداية الأساسية لرحلة التعلم المخصصة والذكية.", "en": "The essential plan for your personalized learning journey."},
            "features": [
                {"en": "Create a personalized learning roadmap", "ar": "إنشاء خريطة تعلم مخصصة بالكامل لخبرتك وأهدافك"},
                {"en": "View the roadmap and study schedule", "ar": "عرض خارطة الطريق والجدول الدراسي"},
                {"en": "AI Assistant", "ar": "المساعد الذكي ZEUS رفيقك الدراسي خطوة بخطوة"},
            ],
        },
        "PRO": {
            "description": {"ar": "الخطة الاحترافية للتطبيق العملي واختبار المعرفة خطوة بخطوة.", "en": "A professional plan for hands-on practice and learning assessments."},
            "features": [
                {"en": "Everything in STARTER", "ar": "كل مميزات باقة STARTER"},
                {"en": "Unlock lessons, learning content, and videos", "ar": "فتح الدروس ومحتواها وفيديوهاتها"},
                {"en": "30-question quiz after each lesson; 80% required to pass", "ar": "اختبار من 30 سؤالًا بعد كل درس، والنجاح من 80%"},
                {"en": "A project after every stage", "ar": "مشروع عملي وتطبيقي شامل بعد كل مرحلة"},
                {"en": "Learning progress", "ar": "متابعة تقدم التعلّم"},
            ],
        },
        "PRIME": {
            "description": {"ar": "الخطة الشاملة للتأهيل والجاهزية لسوق العمل والتوظيف.", "en": "The complete plan for career preparation and job readiness."},
            "features": [
                {"en": "Everything in PRO", "ar": "كل مميزات باقة PRO"},
                {"en": "Profile and certificates", "ar": "الملف الشخصي والشهادات"},
                {"en": "Job search/recommendations relevant to your field", "ar": "بحث واقتراحات وظائف ذكية تطابق مجالك وخبرتك"},
                {"en": "Access to a community related to your field", "ar": "الانضمام لمجتمع المتخصصين والزملاء في مجالك"},
                {"en": "CV builder", "ar": "أداة بناء وتحسين السيرة الذاتية الاحترافية (CV)"},
                {"en": "Public portfolio builder", "ar": "أداة بناء وعرض البورتفوليو العام لمشاريعك"},
            ],
        },
    }

    def plan_content(plan_id):
        prefix = plan_id.lower()
        description = getattr(setting, f"{prefix}_description", None)
        features = getattr(setting, f"{prefix}_features", None)
        return {
            "description": description if isinstance(description, dict) else defaults[plan_id]["description"],
            "features": features if isinstance(features, list) else defaults[plan_id]["features"],
        }

    return {
        "currency": setting.currency,
        "contact_email": setting.subscription_contact_email,
        "social_links": {
            "facebook_url": setting.facebook_url or "",
            "linkedin_url": setting.linkedin_url or "",
            "instagram_url": setting.instagram_url or "",
            "tiktok_url": setting.tiktok_url or "",
            "whatsapp_url": setting.whatsapp_url or "",
        },
        "plans": [
            {
                "id": "STARTER",
                "name": "STARTER",
                "price": setting.starter_price,
                "currency": setting.currency,
                "period": "Month",
                **plan_content("STARTER"),
                "badge": "Popular",
            },
            {
                "id": "PRO",
                "name": "PRO",
                "price": setting.pro_price,
                "currency": setting.currency,
                "period": "Month",
                **plan_content("PRO"),
                "badge": "Best Value",
            },
            {
                "id": "PRIME",
                "name": "PRIME",
                "price": setting.prime_price,
                "currency": setting.currency,
                "period": "Month",
                **plan_content("PRIME"),
                "badge": "Complete",
            },
        ],
    }


@router.post("/submit")
@router.post("/submit/")
@router.post("")
@router.post("/")
def submit_subscription_payment(
    data: dict = Body(...),
    session: Session = Depends(get_session),
    requester_id: Optional[str] = Depends(get_optional_user_id),
):
    """
    Submit a subscription payment transfer request.
    Fields required: full_name, email, phone, plan, payment_image_url
    """
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    plan = (data.get("plan") or "").strip().upper()
    payment_image_url = (data.get("payment_image_url") or "").strip()
    notes = (data.get("notes") or "").strip() or None

    if not full_name or len(full_name) < 3 or len(full_name) > 100 or not _NAME_RE.match(full_name) or any(ch.isdigit() for ch in full_name):
        raise HTTPException(status_code=400, detail="الاسم الكامل غير صالح — حروف فقط (3-100 حرف)")
    if not email or not _EMAIL_RE.match(email) or len(email) > 254:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني غير صالح")
    phone = _normalize_phone(phone)
    if not phone:
        raise HTTPException(status_code=400, detail="رقم الهاتف المستخدم في تحويل المبلغ مطلوب")
    if re.search(r"[^0-9]", phone):
        raise HTTPException(status_code=400, detail="رقم الهاتف يجب أن يحتوي على أرقام فقط بدون رموز أو حروف")
    if len(phone) != 11:
        raise HTTPException(status_code=400, detail="رقم الهاتف يجب أن يكون 11 رقمًا بالضبط")
    if not _EGYPT_MOBILE_RE.match(phone):
        raise HTTPException(status_code=400, detail="رقم مصري غير صالح — يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015")
    if plan not in ("STARTER", "PRO", "PRIME"):
        raise HTTPException(status_code=400, detail="الخطة المختارة غير صالحة")
    if not payment_image_url:
        raise HTTPException(status_code=400, detail="صورة إيصال التحويل مطلوبة")
    if len(payment_image_url) > 500 or payment_image_url.startswith(("javascript:", "data:", "file:", "ftp:", "gopher:")):
        raise HTTPException(status_code=400, detail="صورة إيصال التحويل غير صالحة")
    if not (payment_image_url.startswith("/uploads/") or payment_image_url.startswith("https://")):
        raise HTTPException(status_code=400, detail="صورة إيصال التحويل غير صالحة")

    setting = _get_or_create_settings(session)
    amount_map = {
        "STARTER": setting.starter_price,
        "PRO": setting.pro_price,
        "PRIME": setting.prime_price,
    }
    amount = amount_map.get(plan, 0.0)

    # Link to registered user if exists
    target_user_id = requester_id
    if not target_user_id:
        u = session.exec(select(User).where(User.email == email)).first()
        if u:
            target_user_id = u.id

    sub_req = SubscriptionRequest(
        user_id=target_user_id,
        full_name=full_name,
        email=email,
        phone=phone,
        plan=plan,
        amount=amount,
        payment_image_url=payment_image_url,
        notes=notes,
        status="pending",
        created_date=datetime.utcnow(),
        updated_date=datetime.utcnow(),
    )
    session.add(sub_req)
    session.commit()
    session.refresh(sub_req)

    return {
        "success": True,
        "id": sub_req.id,
        "request_id": sub_req.id,
        "status": sub_req.status,
        "plan": sub_req.plan,
        "amount": sub_req.amount,
        "currency": setting.currency,
        "message": "تم استلام طلب الاشتراك بنجاح! سيتم مراجعته وتفعيل حسابك من قِبل الإدارة في أقرب وقت.",
    }


@router.get("/my-status")
def get_my_subscription_status(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Returns current user's subscription details, tier, and remaining days."""
    return get_user_subscription_info(user, session)
