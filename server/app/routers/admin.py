"""
Admin backend: stats, users, communities, moderation, broadcasts.
All routes require an admin token (403 otherwise).
"""
from datetime import datetime, timedelta
import re

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlmodel import Session, select, func

from ..core.database import get_session
from ..core.deps import require_admin
from ..core.security import hash_password
from ..models import (
    User, LearningProfile, Roadmap, Task, Lesson, LessonProgress,
    GenerationJob, Conversation, Project, CV, Notification,
    Community, CommunityMessage, SubscriptionRequest, AdminSetting, SupportRequest,
)
from .support import SOCIAL_FIELDS, _safe_social_url, _safe_whatsapp_url

router = APIRouter()

OWNED_TABLES = [
    LearningProfile, Roadmap, Task, Lesson, LessonProgress, GenerationJob,
    Conversation, Project, CV, Notification, CommunityMessage,
]


def _day_str(dt) -> str:
    try:
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return ""


def _words(text: str) -> set:
    import re
    return {w for w in re.findall(r"[\w\u0600-\u06FF]{3,}", (text or "").lower())}


def _suggest_community(profile, communities):
    """Best community for a user from their DNA (goal + skills).

    Deterministic and explainable: goal-word overlap wins, shared skills add
    up. Returns {community_id, name, reason} or None.
    """
    if profile is None or not communities:
        return None
    goal = (profile.goal or "")
    skills = set()
    for s in (profile.skill_graph or []):
        if isinstance(s, dict) and s.get("skill"):
            skills.add(str(s["skill"]).lower())
    for s in (profile.known_skills or []) + (profile.target_skills or []):
        skills.add(str(s).lower())
    goal_words = _words(goal)
    best, best_score, best_reason = None, 0, ""
    for c in communities:
        ctext = f"{c.name or ''} {c.goal or ''} {c.stage or ''}"
        cwords = _words(ctext)
        overlap = goal_words & cwords
        shared_skills = {s for s in skills if s and s in ctext.lower()}
        score = len(overlap) * 3 + min(3, len(shared_skills))
        if score <= 0:
            continue
        if score > best_score:
            best, best_score = c, score
            bits = []
            if overlap:
                bits.append("نفس الهدف: " + "، ".join(sorted(overlap)[:3]))
            if shared_skills:
                bits.append("مهارات مشتركة: " + "، ".join(sorted(shared_skills)[:3]))
            best_reason = " + ".join(bits) if bits else "تطابق المجال"
    if not best:
        return None
    return {"community_id": best.id, "name": best.name, "reason": best_reason, "score": best_score}


def _dna_summary(profile) -> dict:
    if not profile:
        return {}
    days = profile.available_days or []
    return {
        "goal": profile.goal,
        "current_level": profile.current_level,
        "learning_style": profile.learning_style,
        "weekly_hours": profile.weekly_hours,
        "available_days": days,
        "video_preference": profile.video_preference,
        "obstacles": getattr(profile, "obstacles", None) if isinstance(getattr(profile, "obstacles", None), list) else [],
    }


@router.get("/stats")
def admin_stats(session: Session = Depends(get_session), admin: User = Depends(require_admin)):
    users = session.exec(select(User)).all()
    total_users = len(users)
    now = datetime.utcnow()
    new7 = sum(1 for u in users if u.created_date and (now - u.created_date).days < 7)
    new30 = sum(1 for u in users if u.created_date and (now - u.created_date).days < 30)
    roadmaps = session.exec(select(Roadmap)).all()
    active_roadmaps = sum(1 for r in roadmaps if r.status == "active")
    lessons = session.exec(select(Lesson)).all()
    lessons_done = sum(1 for l in lessons if l.status == "completed")
    scores = session.exec(select(LessonProgress.quiz_score).where(LessonProgress.quiz_score != None)).all()  # noqa: E711
    avg_quiz = round(sum(scores) / len(scores), 1) if scores else 0
    communities = session.exec(select(Community)).all()
    members_total = sum(len(c.members or []) for c in communities)
    messages_total = session.exec(select(func.count(CommunityMessage.id))).one()
    # Top goals
    goals: dict = {}
    for r in roadmaps:
        if r.goal:
            goals[r.goal] = goals.get(r.goal, 0) + 1
    top_goals = [{"goal": g, "count": c} for g, c in sorted(goals.items(), key=lambda x: -x[1])[:6]]
    # Signups per day (last 30d)
    buckets: dict = {}
    for i in range(30):
        buckets[(now - timedelta(days=i)).strftime("%Y-%m-%d")] = 0
    for u in users:
        d = _day_str(u.created_date)
        if d in buckets:
            buckets[d] += 1
    signups = [{"day": d, "count": buckets[d]} for d in sorted(buckets)]
    return {
        "users": total_users, "new7": new7, "new30": new30,
        "roadmaps": len(roadmaps), "active_roadmaps": active_roadmaps,
        "lessons": len(lessons), "lessons_done": lessons_done,
        "avg_quiz": avg_quiz, "communities": len(communities),
        "members_total": members_total, "messages": messages_total,
        "top_goals": top_goals, "signups": signups,
    }


@router.get("/support-requests")
def admin_support_requests(
    status: str = Query(default=""),
    limit: int = Query(default=100, le=200),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    query = select(SupportRequest).order_by(SupportRequest.created_date.desc()).limit(limit)
    if status:
        if status not in {"open", "in_progress", "resolved", "closed"}:
            raise HTTPException(status_code=400, detail="Invalid support status")
        query = select(SupportRequest).where(SupportRequest.status == status).order_by(
            SupportRequest.created_date.desc()
        ).limit(limit)
    return [item.model_dump() for item in session.exec(query).all()]


@router.put("/support-requests/{request_id}")
def admin_update_support_request(
    request_id: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    item = session.get(SupportRequest, request_id)
    if not item:
        raise HTTPException(status_code=404, detail="Support request not found")
    status = data.get("status")
    if status not in {"open", "in_progress", "resolved", "closed"}:
        raise HTTPException(status_code=400, detail="Invalid support status")
    item.status = status
    item.updated_date = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return item.model_dump()


@router.get("/users")
def admin_users(
    search: str = Query(default=""), limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    users = session.exec(select(User).order_by(User.created_date.desc())).all()
    q = (search or "").strip().lower()
    if q:
        users = [u for u in users if q in (u.email or "").lower() or q in (u.full_name or "").lower()]
    communities = session.exec(select(Community)).all()
    out = []
    for u in users[offset:offset + limit]:
        prof = session.exec(
            select(LearningProfile).where(LearningProfile.user_id == u.id).order_by(LearningProfile.created_date.desc())
        ).first()
        done = session.exec(select(func.count(Lesson.id)).where(Lesson.user_id == u.id, Lesson.status == "completed")).one()
        total = session.exec(select(func.count(Lesson.id)).where(Lesson.user_id == u.id)).one()
        memberships = [{"id": c.id, "name": c.name} for c in communities if u.id in (c.members or [])]
        member_ids = {c.id for c in communities if u.id in (c.members or [])}
        suggested = _suggest_community(prof, [c for c in communities if c.id not in member_ids])
        out.append({
            "id": u.id, "email": u.email, "full_name": u.full_name,
            "role": getattr(u, "role", "user") or "user",
            "status": getattr(u, "status", "active") or "active",
            "subscription_plan": getattr(u, "subscription_plan", None),
            "subscription_status": getattr(u, "subscription_status", "none") or "none",
            "subscription_start": u.subscription_start.isoformat() if getattr(u, "subscription_start", None) else None,
            "subscription_expires": u.subscription_expires.isoformat() if getattr(u, "subscription_expires", None) else None,
            "created_date": u.created_date.isoformat() if u.created_date else None,
            "goal": prof.goal if prof else None,
            "onboarding_step": prof.onboarding_step if prof else None,
            "lessons_done": done, "lessons_total": total,
            "dna": _dna_summary(prof),
            "memberships": memberships,
            "suggested": suggested,
        })
    return {"users": out, "total": len(users)}


@router.put("/users/{user_id}")
def admin_update_user(
    user_id: str, data: dict = Body(...),
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if "role" in data:
        if data["role"] not in ("admin", "user"):
            raise HTTPException(status_code=400, detail="Invalid role")
        if u.id == admin.id and data["role"] != "admin":
            raise HTTPException(status_code=400, detail="You cannot demote yourself")
        u.role = data["role"]
    if "status" in data:
        if data["status"] not in ("active", "pending", "suspended"):
            raise HTTPException(status_code=400, detail="Invalid status")
        if u.id == admin.id and data["status"] != "active":
            raise HTTPException(status_code=400, detail="You cannot deactivate yourself")
        if data["status"] == "active":
            # Activation requires an active subscription plan first.
            has_plan = bool(getattr(u, "subscription_plan", None)) and getattr(u, "subscription_status", "none") == "active"
            wants_plan = isinstance(data.get("subscription_plan"), str) and data.get("subscription_plan") in ("STARTER", "PRO", "PRIME")
            if not has_plan and not wants_plan:
                raise HTTPException(status_code=400, detail="Cannot activate account without assigning a subscription plan (STARTER/PRO/PRIME) first")
        u.status = data["status"]
    if "subscription_plan" in data:
        plan = data["subscription_plan"]
        if plan in ("STARTER", "PRO", "PRIME"):
            u.subscription_plan = plan
            u.subscription_status = "active"
            u.subscription_start = datetime.utcnow()
            u.subscription_expires = datetime.utcnow() + timedelta(days=30)
        elif plan in ("FREE", "NONE", None, ""):
            u.subscription_plan = None
            u.subscription_status = "none"
            u.subscription_expires = None
        else:
            raise HTTPException(status_code=400, detail="Invalid subscription plan")
    if data.get("password"):
        if len(data["password"]) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        u.password_hash = hash_password(data["password"])
    if "full_name" in data:
        u.full_name = data["full_name"] or None
    u.updated_date = datetime.utcnow()
    session.add(u)
    session.commit()
    session.refresh(u)
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "status": getattr(u, "status", "active"),
        "subscription_plan": u.subscription_plan,
        "subscription_status": u.subscription_status,
        "subscription_expires": u.subscription_expires.isoformat() if u.subscription_expires else None,
    }


@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: str, session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    removed = 0
    for Model in OWNED_TABLES:
        rows = session.exec(select(Model).where(Model.user_id == user_id)).all()
        for r in rows:
            session.delete(r)
            removed += 1
    # Remove from community member lists
    for c in session.exec(select(Community)).all():
        members = list(c.members or [])
        if user_id in members:
            members.remove(user_id)
            c.members = list(members)
            c.member_count = len(members)
            session.add(c)
    session.delete(u)
    session.commit()
    return {"deleted": True, "rows_removed": removed}


@router.get("/communities")
def admin_communities(session: Session = Depends(get_session), admin: User = Depends(require_admin)):
    comms = session.exec(select(Community).order_by(Community.created_date.desc())).all()
    users = session.exec(select(User)).all()
    prof_by_user = {}
    for u in users:
        p = session.exec(
            select(LearningProfile).where(LearningProfile.user_id == u.id).order_by(LearningProfile.created_date.desc())
        ).first()
        if p:
            prof_by_user[u.id] = p
    out = []
    for c in comms:
        msg_count = session.exec(select(func.count(CommunityMessage.id)).where(CommunityMessage.community_id == c.id)).one()
        members = c.members or []
        member_users = [{"id": u.id, "email": u.email, "full_name": u.full_name} for u in users if u.id in members]
        # Suggested members: users whose DNA matches this community and aren't in it
        sugg = []
        for u in users:
            if u.id in members or getattr(u, "role", "user") == "admin":
                continue
            s = _suggest_community(prof_by_user.get(u.id), [c])
            if s:
                sugg.append({"id": u.id, "email": u.email, "full_name": u.full_name,
                             "goal": (prof_by_user.get(u.id).goal if prof_by_user.get(u.id) else None),
                             "reason": s["reason"]})
        out.append({**c.model_dump(), "messages": msg_count, "member_users": member_users, "suggested_members": sugg[:10]})
    return out


@router.post("/communities")
def admin_create_community(
    data: dict = Body(...), session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    import uuid
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    c = Community(
        id=str(uuid.uuid4()), name=name, goal=data.get("goal"),
        stage=data.get("stage"), members=[], member_count=0,
        created_date=datetime.utcnow(), updated_date=datetime.utcnow(),
    )
    # Community has no description/language columns — store extras nowhere; ignore silently
    session.add(c)
    session.commit()
    session.refresh(c)
    return c.model_dump()


@router.put("/communities/{community_id}")
def admin_update_community(
    community_id: str, data: dict = Body(...),
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    c = session.get(Community, community_id)
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    for k in ("name", "goal", "stage"):
        if k in data and data[k] is not None:
            setattr(c, k, data[k])
    c.updated_date = datetime.utcnow()
    session.add(c)
    session.commit()
    session.refresh(c)
    return c.model_dump()


@router.delete("/communities/{community_id}")
def admin_delete_community(
    community_id: str, session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    c = session.get(Community, community_id)
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    msgs = session.exec(select(CommunityMessage).where(CommunityMessage.community_id == community_id)).all()
    for m in msgs:
        session.delete(m)
    session.delete(c)
    session.commit()
    return {"deleted": True, "messages_removed": len(msgs)}


@router.get("/messages")
def admin_messages(
    limit: int = Query(default=50, le=200),
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    msgs = session.exec(select(CommunityMessage).order_by(CommunityMessage.created_date.desc()).limit(limit)).all()
    out = []
    for m in msgs:
        c = session.get(Community, m.community_id)
        u = session.get(User, m.user_id) if m.user_id else None
        out.append({
            "id": m.id, "text": m.text, "community_id": m.community_id,
            "community_name": c.name if c else "?",
            "user_email": u.email if u else (m.user_name or m.user_id),
            "created_date": m.created_date.isoformat() if m.created_date else None,
        })
    return out


@router.delete("/messages/{message_id}")
def admin_delete_message(
    message_id: str, session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    m = session.get(CommunityMessage, message_id)
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    session.delete(m)
    session.commit()
    return {"deleted": True}


@router.post("/communities/{community_id}/members")
def admin_add_member(
    community_id: str, data: dict = Body(...),
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    """Assign a user to a community + notify them (shows up in their list)."""
    import uuid
    target = data.get("user_id")
    if not target:
        raise HTTPException(status_code=400, detail="user_id required")
    c = session.get(Community, community_id)
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    target_user = session.get(User, target)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    members = list(c.members or [])
    if target not in members:
        members.append(target)
    c.members = list(members)
    c.member_count = len(members)
    c.updated_date = datetime.utcnow()
    session.add(c)
    session.add(Notification(
        id=str(uuid.uuid4()), user_id=target, type="community",
        title="انضممت لمجتمع جديد! 🎉",
        body=f"أضافك الأدمن لمجتمع '{c.name}'. ادخل على صفحة المجتمع وابدأ الشات.",
        action_label="افتح المجتمع", action_url="/community",
        created_date=datetime.utcnow(), updated_date=datetime.utcnow(),
    ))
    session.commit()
    session.refresh(c)
    return c.model_dump()


@router.delete("/communities/{community_id}/members/{user_id}")
def admin_remove_member(
    community_id: str, user_id: str,
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    c = session.get(Community, community_id)
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    members = [m for m in (c.members or []) if m != user_id]
    c.members = members
    c.member_count = len(members)
    c.updated_date = datetime.utcnow()
    session.add(c)
    session.commit()
    session.refresh(c)
    return c.model_dump()


@router.post("/communities/{community_id}/ban")
def admin_ban_member(
    community_id: str, data: dict = Body(...),
    session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    target = data.get("user_id")
    if not target:
        raise HTTPException(status_code=400, detail="user_id required")
    c = session.get(Community, community_id)
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    members = [m for m in (c.members or []) if m != target]
    c.members = members
    c.member_count = len(members)
    c.updated_date = datetime.utcnow()
    session.add(c)
    session.commit()
    return c.model_dump()


@router.post("/broadcast")
def admin_broadcast(
    data: dict = Body(...), session: Session = Depends(get_session), admin: User = Depends(require_admin),
):
    import uuid
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    if not title or not body:
        raise HTTPException(status_code=400, detail="Title and body are required")
    # Targeted mode: resolve one user by email (or name fragment) instead of all
    target = (data.get("user_email") or "").strip().lower()
    users = session.exec(select(User)).all()
    if target:
        match = next((u for u in users if (u.email or "").lower() == target), None)
        if not match:
            match = next((u for u in users if target in (u.email or "").lower() or target in (u.full_name or "").lower()), None)
        if not match:
            raise HTTPException(status_code=404, detail="No user matches that email or name")
        users = [match]
    n = 0
    for u in users:
        session.add(Notification(
            id=str(uuid.uuid4()), user_id=u.id, type="announcement",
            title=title, body=body,
            action_label=data.get("action_label"), action_url=data.get("action_url"),
            created_date=datetime.utcnow(), updated_date=datetime.utcnow(),
        ))
        n += 1
    session.commit()
    return {"sent": n, "targeted": bool(target)}


# ---------------- Subscribers & Subscription Requests ----------------

@router.get("/subscribers")
def admin_subscribers(
    status: str = Query(default=""),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    stmt = select(SubscriptionRequest).order_by(SubscriptionRequest.created_date.desc())
    if status:
        stmt = stmt.where(SubscriptionRequest.status == status)
    reqs = session.exec(stmt).all()
    now = datetime.utcnow()
    out = []
    for r in reqs:
        # Check active status and remaining days
        remaining_days = None
        is_expired = False
        if r.expires_at:
            delta = (r.expires_at - now).total_seconds()
            remaining_days = max(0, int(delta // 86400))
            is_expired = delta <= 0

        # Check corresponding user account
        target_user = None
        if r.user_id:
            target_user = session.get(User, r.user_id)
        if not target_user and r.email:
            target_user = session.exec(select(User).where(User.email == r.email.lower())).first()

        out.append({
            "id": r.id,
            "user_id": r.user_id or (target_user.id if target_user else None),
            "user_name": r.full_name or (target_user.full_name if target_user else ""),
            "email": r.email,
            "phone": r.phone,
            "plan": r.plan,
            "amount": r.amount,
            "payment_image_url": r.payment_image_url,
            "notes": r.notes,
            "status": r.status,
            "start_date": r.start_date.isoformat() if r.start_date else None,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "created_date": r.created_date.isoformat() if r.created_date else None,
            "remaining_days": remaining_days,
            "is_expired": is_expired,
            "user_account_status": target_user.status if target_user else "not_registered",
        })
    return out


@router.post("/subscribers/{request_id}/approve")
def admin_approve_subscriber(
    request_id: str,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    sub = session.get(SubscriptionRequest, request_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription request not found")

    now = datetime.utcnow()
    if sub.plan not in ("STARTER", "PRO", "PRIME"):
        raise HTTPException(status_code=400, detail="Cannot approve without a valid plan (STARTER/PRO/PRIME)")
    sub.status = "approved"
    sub.start_date = now
    sub.expires_at = now + timedelta(days=30)
    sub.updated_date = now
    session.add(sub)

    # Find or link the user account
    target_user = None
    if sub.user_id:
        target_user = session.get(User, sub.user_id)
    if not target_user and sub.email:
        target_user = session.exec(select(User).where(User.email == sub.email.lower())).first()

    if target_user:
        target_user.status = "active"
        target_user.subscription_plan = sub.plan
        target_user.subscription_status = "active"
        target_user.subscription_start = sub.start_date
        target_user.subscription_expires = sub.expires_at
        target_user.updated_date = now
        session.add(target_user)

        import uuid
        plan_ar = {"STARTER": "ستارتر", "PRO": "برو", "PRIME": "برايم"}.get(sub.plan, sub.plan)
        session.add(Notification(
            id=str(uuid.uuid4()),
            user_id=target_user.id,
            type="subscription",
            title=f"تم تفعيل اشتراكك ({sub.plan})! 🎉",
            body=f"تم تأكيد الدفع وتفعيل باقة {plan_ar} بنجاح لمدة 30 يوم حتى {sub.expires_at.strftime('%Y-%m-%d')}.",
            action_label="ابدأ الآن",
            action_url="/app",
            created_date=now,
            updated_date=now,
        ))

    session.commit()
    session.refresh(sub)
    return {
        "success": True,
        "message": f"تمت الموافقة على اشتراك {sub.email} وتفعيل باقة {sub.plan} بنجاح",
        "sub": {
            "id": sub.id,
            "status": sub.status,
            "start_date": sub.start_date.isoformat(),
            "expires_at": sub.expires_at.isoformat(),
        },
    }


@router.post("/subscribers/{request_id}/reject")
def admin_reject_subscriber(
    request_id: str,
    data: dict = Body(default={}),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    sub = session.get(SubscriptionRequest, request_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription request not found")

    now = datetime.utcnow()
    sub.status = "rejected"
    sub.notes = (sub.notes or "") + (f"\n[سبب الرفض: {data.get('reason')}]" if data.get("reason") else "")
    sub.updated_date = now
    session.add(sub)
    session.commit()
    return {"success": True, "message": "تم رفض طلب الاشتراك"}


# ---------------- Admin Settings: Pricing, AI Models, YouTube API, External Services ----------------

@router.get("/settings/ai-status")
def admin_ai_status(
    admin: User = Depends(require_admin),
):
    from ..services.llm import TASK_ROUTES, _get_runtime_settings

    cfg = _get_runtime_settings()
    providers = {
        "openai": ("openai_api_key", "openai_model"),
        "gemini": ("gemini_api_key", "gemini_model"),
    }
    return {
        "providers": {
            name: {
                "configured": bool(cfg.get(key)),
                "model": cfg.get(model, ""),
            }
            for name, (key, model) in providers.items()
        },
        "career_research": {
            "gemini": bool(cfg.get("gemini_api_key")),
            "openai": bool(cfg.get("openai_api_key")),
        },
        "task_routes": TASK_ROUTES,
    }


@router.post("/settings/test-provider")
async def admin_test_ai_provider(
    data: dict = Body(...),
    admin: User = Depends(require_admin),
):
    provider = str(data.get("provider", "")).strip().lower()
    if provider not in {"openai", "gemini"}:
        raise HTTPException(status_code=400, detail="Unsupported AI provider")

    from ..services.llm import test_ai_provider

    try:
        result = await test_ai_provider(provider)
    except Exception as exc:
        print(f"Admin AI provider test failed for {provider} ({type(exc).__name__})")
        result = {"success": False, "code": "connection_failed"}

    language = "ar" if data.get("language") == "ar" else "en"
    provider_title = "Gemini" if provider == "gemini" else "OpenAI"
    messages = {
        "ok": (
            f"اتصال {provider_title} ناجح"
            if language == "ar" else f"{provider_title} connection successful"
        ),
        "missing_key": (
            f"مفتاح {provider_title} غير مضبوط"
            if language == "ar" else f"{provider_title} API key is not configured"
        ),
        "key_or_access_denied": (
            f"تم رفض المفتاح أو لا يملك صلاحية استخدام {provider_title}"
            if language == "ar" else f"The key was rejected or does not have access to {provider_title}"
        ),
        "model_not_found": (
            "اسم الموديل غير موجود أو غير متاح لهذا المفتاح"
            if language == "ar" else "The model name was not found or is unavailable to this key"
        ),
        "model_not_available": (
            "الموديل المحدد غير متاح لهذا المفتاح. الموديلات المدعومة الظاهرة من Google موجودة أدناه."
            if language == "ar" else "The selected model is unavailable to this key. Google-listed compatible models are shown below."
        ),
        "quota_or_rate_limit": (
            f"تم تجاوز حصة {provider_title} أو حد الطلبات؛ تحقق من حصة حسابك"
            if language == "ar" else f"{provider_title} quota or rate limit reached; check the account quota"
        ),
        "timeout": (
            f"انتهت مهلة الاتصال بـ {provider_title}"
            if language == "ar" else f"The {provider_title} connection timed out"
        ),
        "network_error": (
            f"تعذر الوصول إلى {provider_title}؛ تحقق من اتصال الخادم بالإنترنت"
            if language == "ar" else f"Could not reach {provider_title}; check the server's internet connection"
        ),
        "empty_response": (
            f"تم الاتصال بـ {provider_title} لكن لم تصل إجابة نصية"
            if language == "ar" else f"Connected to {provider_title}, but no text response was returned"
        ),
        "provider_error": (
            f"رفض {provider_title} الطلب؛ تحقق من إعدادات المفتاح والموديل"
            if language == "ar" else f"{provider_title} rejected the request; check the key and model settings"
        ),
        "connection_failed": (
            f"فشل الاتصال بـ {provider_title}؛ تحقق من المفتاح والموديل والحصة"
            if language == "ar" else f"Connection to {provider_title} failed; check the key, model, and provider quota"
        ),
    }
    code = result.get("code", "connection_failed")
    message = messages.get(code, messages["connection_failed"])
    available_models = result.get("available_models", [])
    if code == "model_not_available" and not available_models:
        message = (
            "Google لم تعرض موديلات متوافقة لهذا المفتاح؛ تحقق من تفعيل Gemini API وصلاحية المفتاح."
            if language == "ar" else
            "Google did not list compatible models for this key; check Gemini API activation and key access."
        )
    return {
        "success": result.get("success", False),
        "provider": provider,
        "code": code,
        "message": message,
        "available_models": available_models,
    }


@router.get("/settings")
@router.get("/settings/")
def admin_get_settings(
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    setting = session.get(AdminSetting, "default")
    if not setting:
        import os
        from ..core.config import settings as cfg
        setting = AdminSetting(
            id="default",
            starter_price=99.0,
            pro_price=199.0,
            prime_price=399.0,
            currency="EGP",
            gemini_api_key=os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "") or cfg.gemini_api_key,
            gemini_model=os.getenv("GEMINI_MODEL", "") or cfg.gemini_model,
            openai_api_key=os.getenv("OPENAI_API_KEY", "") or cfg.openai_api_key,
            openai_model="gpt-4o-mini",
            youtube_api_key=os.getenv("YOUTUBE_API_KEY", "") or cfg.youtube_api_key,
            active_ai_provider="auto",
        )
        session.add(setting)
        session.commit()
        session.refresh(setting)

    res = setting.model_dump()
    # Remove unused keys from output
    res.pop("search_api_key", None)
    res.pop("job_search_api_key", None)
    # Never return full secret values — mask to last 4 chars.
    for k in ("gemini_api_key", "openai_api_key", "youtube_api_key"):
        v = res.get(k) or ""
        res[k] = ("…" + v[-4:]) if len(v) > 4 else ("…" if v else "")
    return res


@router.put("/settings")
@router.put("/settings/")
@router.post("/settings")
@router.post("/settings/")
def admin_update_settings(
    data: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    setting = session.get(AdminSetting, "default")
    if not setting:
        setting = AdminSetting(id="default")

    allowed_fields = [
        "starter_price", "pro_price", "prime_price", "currency",
        "subscription_contact_email",
        "starter_description", "starter_features", "pro_description", "pro_features",
        "prime_description", "prime_features",
        "gemini_api_key", "gemini_model", "openai_api_key", "openai_model",
        "youtube_api_key", *SOCIAL_FIELDS,
    ]

    secret_fields = {"gemini_api_key", "openai_api_key", "youtube_api_key"}
    clear_secrets = data.get("clear_secrets", [])
    if not isinstance(clear_secrets, list) or any(key not in secret_fields for key in clear_secrets):
        raise HTTPException(status_code=400, detail="Invalid secret fields to clear")

    for key in clear_secrets:
        setattr(setting, key, "")

    for k in allowed_fields:
        if k in data and data[k] is not None:
            val = data[k]
            if k == "subscription_contact_email":
                val = str(val).strip().lower()
                if len(val) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", val):
                    raise HTTPException(status_code=400, detail="Enter a valid subscription contact email")
            if k.endswith("_description"):
                if not isinstance(val, dict) or any(
                    not isinstance(val.get(language), str) or not val[language].strip() or len(val[language]) > 500
                    for language in ("ar", "en")
                ):
                    raise HTTPException(status_code=400, detail=f"{k} must contain Arabic and English descriptions")
                val = {language: val[language].strip() for language in ("ar", "en")}
            if k.endswith("_features"):
                if not isinstance(val, list) or not val or len(val) > 12:
                    raise HTTPException(status_code=400, detail=f"{k} must contain 1 to 12 features")
                if any(
                    not isinstance(item, dict)
                    or any(not isinstance(item.get(language), str) or not item[language].strip() or len(item[language]) > 250 for language in ("ar", "en"))
                    for item in val
                ):
                    raise HTTPException(status_code=400, detail=f"{k} features must contain Arabic and English text")
                val = [{language: item[language].strip() for language in ("ar", "en")} for item in val]
            if k in SOCIAL_FIELDS:
                val = _safe_whatsapp_url(str(val)) if k == "whatsapp_url" else _safe_social_url(str(val))
            if k in secret_fields and isinstance(val, str):
                val = val.strip()
                if not val or val.startswith("…"):
                    continue  # blank or a read-only mask = keep the stored secret
            if k in ("starter_price", "pro_price", "prime_price"):
                try:
                    val = float(val)
                except ValueError:
                    continue
            setattr(setting, k, val)
    setting.updated_date = datetime.utcnow()
    session.add(setting)
    session.commit()
    session.refresh(setting)

    # Invalidate resource search cache if YouTube API key was updated
    if "youtube_api_key" in data:
        try:
            from ..services.resources import _cache
            _cache.clear()
        except Exception:
            pass

    masked = setting.model_dump()
    for k in ("gemini_api_key", "openai_api_key", "youtube_api_key"):
        v = masked.get(k) or ""
        masked[k] = ("…" + v[-4:]) if len(v) > 4 else ("…" if v else "")
    return {"success": True, "settings": masked}
