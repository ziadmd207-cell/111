"""
Generic CRUD for all entities — scoped per authenticated user.
Every row is owned by the token's user_id; cross-user access returns 404.
Strict subscription tier restrictions are enforced server-side.
"""
from fastapi import APIRouter, Depends, Query, Body, HTTPException
from sqlmodel import Session, select
from typing import Optional
from ..core.database import get_session
from ..core.deps import get_current_user_id, get_user_subscription_info, TIER_RANKS
from ..models import (
    LearningProfile, Roadmap, Task, Lesson, LessonProgress,
    GenerationJob, Conversation, Project, CV, Notification,
    Community, CommunityMessage, User
)
import uuid
from datetime import datetime

router = APIRouter()

# Map entity names to models
ENTITY_MODELS = {
    "LearningProfile": LearningProfile,
    "Roadmap": Roadmap,
    "Task": Task,
    "Lesson": Lesson,
    "LessonProgress": LessonProgress,
    "GenerationJob": GenerationJob,
    "Conversation": Conversation,
    "Project": Project,
    "CV": CV,
    "Notification": Notification,
    "Community": Community,
    "CommunityMessage": CommunityMessage,
}

# Tier requirements per entity:
# STARTER: Roadmap, Task, Lesson, LessonProgress, Conversation, LearningProfile, Notification
# PRO: Everything in STARTER + Project
# PRIME: Everything in PRO + CV, Community, CommunityMessage
ENTITY_REQUIRED_TIERS = {
    "Project": "PRO",
    "CV": "PRIME",
    "Community": "PRIME",
    "CommunityMessage": "PRIME",
}


# Fields clients may never set directly (progression, ownership, tier, audit).
# Anything here is stripped on create/update/bulk paths — enforced server-side.
BLOCKED_FIELDS = {
    "id", "user_id", "role", "status", "quiz_passed", "quiz_score",
    "content_ready", "video_verified", "completed_date", "created_date",
    "updated_date", "completed_at", "quiz_passing_score", "subscription_plan",
    "subscription_status", "subscription_start", "subscription_expires",
    "google_id", "password_hash", "members",
}
MAX_LIMIT = 200
MAX_BATCH = 100


def _sanitize(data: dict) -> dict:
    return {k: v for k, v in (data or {}).items() if k not in BLOCKED_FIELDS}


def _model_for(entity: str):
    m = ENTITY_MODELS.get(entity)
    if not m:
        raise HTTPException(status_code=404, detail="Unknown entity")
    return m


def _is_admin(session: Session, user_id: str) -> bool:
    u = session.get(User, user_id)
    return bool(u and getattr(u, "role", "user") == "admin")


def _require_community_admin(entity: str, user_id: str, session: Session):
    """Communities are admin-managed: only admins may create/edit/delete them."""
    if entity != "Community":
        return
    u = session.get(User, user_id)
    if not u or getattr(u, "role", "user") != "admin":
        raise HTTPException(status_code=403, detail="Communities are managed by admins")


def _enforce_tier(entity: str, user_id: str, session: Session):
    """Server-side check: does the user have the required subscription tier for this entity?"""
    min_tier = ENTITY_REQUIRED_TIERS.get(entity)
    if not min_tier:
        return
    if _is_admin(session, user_id):
        return

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    info = get_user_subscription_info(user, session)
    user_tier = info.get("tier", "NONE")
    user_rank = TIER_RANKS.get(user_tier, 0)
    min_rank = TIER_RANKS.get(min_tier, 0)

    if user_rank < min_rank:
        status = info.get("status", "none")
        if status == "expired":
            msg = f"Subscription expired. Please renew your {min_tier} plan to access {entity}."
        else:
            msg = f"Feature restricted. Accessing {entity} requires an active {min_tier} plan."
        raise HTTPException(
            status_code=403,
            detail=msg,
            headers={"X-Required-Tier": min_tier, "X-Current-Tier": user_tier}
        )


def _owned_or_404(Model, obj_id: str, user_id: str, session: Session):
    obj = session.get(Model, obj_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Not found")
    if hasattr(obj, "user_id") and obj.user_id != user_id:
        raise HTTPException(status_code=404, detail="Not found")
    return obj


@router.get("/{entity}")
def list_entities(
    entity: str,
    sort: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id)
):
    Model = _model_for(entity)
    _enforce_tier(entity, user_id, session)

    if entity == "Community" and not _is_admin(session, user_id):
        all_c = session.exec(select(Model).order_by(Model.created_date.desc())).all()
        mine = [c for c in all_c if user_id in (c.members or [])]
        return mine[:limit]

    stmt = select(Model).where(Model.user_id == user_id) if hasattr(Model, "user_id") else select(Model)
    if sort:
        desc = sort.startswith("-")
        field = sort.lstrip("-")
        col = getattr(Model, field, None) or getattr(Model, "created_date", None)
        if col is not None:
            stmt = stmt.order_by(col.desc() if desc else col)
    stmt = stmt.limit(limit)
    return session.exec(stmt).all()


@router.get("/{entity}/{item_id}")
def get_entity(
    entity: str,
    item_id: str,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id)
):
    Model = _model_for(entity)
    _enforce_tier(entity, user_id, session)

    if entity == "Community" and not _is_admin(session, user_id):
        obj = session.get(Model, item_id)
        if not obj or user_id not in (obj.members or []):
            raise HTTPException(status_code=404, detail="Not found")
        return obj
    return _owned_or_404(Model, item_id, user_id, session)


@router.post("/{entity}")
def create_entity(
    entity: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id)
):
    Model = _model_for(entity)
    _enforce_tier(entity, user_id, session)
    _require_community_admin(entity, user_id, session)

    data = _sanitize(data)
    if hasattr(Model, "user_id"):
        data["user_id"] = user_id
    if "id" not in data:
        data["id"] = str(uuid.uuid4())
    data["created_date"] = datetime.utcnow()
    data["updated_date"] = datetime.utcnow()
    try:
        obj = Model(**data)
    except TypeError:
        raise HTTPException(status_code=400, detail="Invalid fields for entity")
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.put("/{entity}/{item_id}")
def update_entity(
    entity: str,
    item_id: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id)
):
    Model = _model_for(entity)
    _enforce_tier(entity, user_id, session)
    _require_community_admin(entity, user_id, session)
    obj = _owned_or_404(Model, item_id, user_id, session)

    for k, v in _sanitize(data).items():
        if hasattr(obj, k):
            setattr(obj, k, v)
    obj.updated_date = datetime.utcnow()
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@router.post("/{entity}/bulkCreate")
def bulk_create(
    entity: str,
    data: list = Body(...),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id)
):
    Model = _model_for(entity)
    _enforce_tier(entity, user_id, session)
    _require_community_admin(entity, user_id, session)

    if not isinstance(data, list) or len(data) > MAX_BATCH:
        raise HTTPException(status_code=400, detail="Batch too large (max 100)")
    objs = []
    for item in data:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Invalid batch item")
        item = _sanitize(item)
        if hasattr(Model, "user_id"):
            item["user_id"] = user_id
        if "id" not in item:
            item["id"] = str(uuid.uuid4())
        item["created_date"] = datetime.utcnow()
        item["updated_date"] = datetime.utcnow()
        try:
            obj = Model(**item)
        except TypeError:
            raise HTTPException(status_code=400, detail="Invalid fields for entity")
        session.add(obj)
        objs.append(obj)
    session.commit()
    for o in objs:
        session.refresh(o)
    return objs


@router.post("/{entity}/updateMany")
def update_many(
    entity: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id)
):
    Model = _model_for(entity)
    _enforce_tier(entity, user_id, session)
    _require_community_admin(entity, user_id, session)

    filter_q = data.get("filter", {})
    update_data = data.get("update", {}) or data.get("$set", {}) or data
    if "filter" in data or "update" in data:
        filter_q = data.get("filter", {})
        update_data = data.get("update", data.get("$set", {}))
        if "$set" in update_data:
            update_data = update_data["$set"]
    update_data = _sanitize(update_data)

    stmt = select(Model).where(Model.user_id == user_id) if hasattr(Model, "user_id") else select(Model)
    if not isinstance(filter_q, dict):
        raise HTTPException(status_code=400, detail="Invalid filter")
    for k, v in list(filter_q.items())[:20]:
        if k in ("user_id", "id"):
            continue
        if hasattr(Model, k) and isinstance(v, (str, int, float, bool)):
            stmt = stmt.where(getattr(Model, k) == v)
    objs = session.exec(stmt.limit(MAX_BATCH + 1)).all()
    if len(objs) > MAX_BATCH:
        raise HTTPException(status_code=400, detail="Filter matches too many rows")
    for obj in objs:
        for k, v in update_data.items():
            if hasattr(obj, k):
                setattr(obj, k, v)
        obj.updated_date = datetime.utcnow()
        session.add(obj)
    session.commit()
    return {"updated": len(objs)}


@router.post("/{entity}/bulkUpdate")
def bulk_update(
    entity: str,
    data: list = Body(...),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id)
):
    Model = _model_for(entity)
    _enforce_tier(entity, user_id, session)
    _require_community_admin(entity, user_id, session)

    if not isinstance(data, list) or len(data) > MAX_BATCH:
        raise HTTPException(status_code=400, detail="Batch too large (max 100)")
    updated = []
    for item in data:
        if not isinstance(item, dict):
            continue
        _id = item.get("id")
        if not _id:
            continue
        obj = session.get(Model, _id)
        if not obj:
            continue
        if hasattr(obj, "user_id") and obj.user_id != user_id:
            continue
        for k, v in _sanitize(item).items():
            if hasattr(obj, k):
                setattr(obj, k, v)
        obj.updated_date = datetime.utcnow()
        session.add(obj)
        updated.append(obj)
    session.commit()
    return updated


@router.delete("/{entity}/{item_id}")
def delete_entity(
    entity: str,
    item_id: str,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id)
):
    Model = _model_for(entity)
    _enforce_tier(entity, user_id, session)
    _require_community_admin(entity, user_id, session)

    obj = session.get(Model, item_id)
    if obj and (not hasattr(obj, "user_id") or obj.user_id == user_id):
        session.delete(obj)
        session.commit()
    return {"deleted": True}


@router.post("/{entity}/deleteMany")
def delete_many(
    entity: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id)
):
    Model = _model_for(entity)
    _enforce_tier(entity, user_id, session)
    _require_community_admin(entity, user_id, session)

    filter_q = data.get("filter", data) if isinstance(data, dict) else {}
    if not isinstance(filter_q, dict) or not filter_q:
        raise HTTPException(status_code=400, detail="Filter required")
    stmt = select(Model).where(Model.user_id == user_id) if hasattr(Model, "user_id") else select(Model)
    for k, v in list(filter_q.items())[:20]:
        if k in ("user_id", "id"):
            continue
        if hasattr(Model, k) and isinstance(v, (str, int, float, bool)):
            stmt = stmt.where(getattr(Model, k) == v)
    objs = session.exec(stmt.limit(MAX_BATCH + 1)).all()
    if len(objs) > MAX_BATCH:
        raise HTTPException(status_code=400, detail="Filter matches too many rows")
    for o in objs:
        session.delete(o)
    session.commit()
    return {"deleted": len(objs)}


@router.post("/{entity}/filter")
def filter_entities(
    entity: str,
    data: dict = Body(...),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user_id)
):
    Model = _model_for(entity)
    _enforce_tier(entity, user_id, session)

    filt = data.get("filter", data) if isinstance(data, dict) else {}
    if "filter" in data:
        filt = data.get("filter", {})
        sort = data.get("sort")
        limit = data.get("limit", 50)
    else:
        sort = data.get("sort")
        limit = data.get("limit", 50)
        filt = {k: v for k, v in data.items() if k not in ("sort", "limit")}
    try:
        limit = max(1, min(int(limit), MAX_LIMIT))
    except (TypeError, ValueError):
        limit = 50
    if not isinstance(filt, dict):
        raise HTTPException(status_code=400, detail="Invalid filter")

    if entity == "Community" and not _is_admin(session, user_id):
        all_c = session.exec(select(Model).order_by(Model.created_date.desc())).all()
        mine = [c for c in all_c if user_id in (c.members or [])]
        return mine[:limit]

    stmt = select(Model).where(Model.user_id == user_id) if hasattr(Model, "user_id") else select(Model)
    for k, v in filt.items():
        if k in ("user_id",):
            continue
        if not hasattr(Model, k):
            continue
        if isinstance(v, dict) and "$ne" in v:
            stmt = stmt.where(getattr(Model, k) != v["$ne"])
        else:
            stmt = stmt.where(getattr(Model, k) == v)

    if sort:
        desc = sort.startswith("-")
        field = sort.lstrip("-")
        col = getattr(Model, field, None) or getattr(Model, "created_date", None)
        if col is not None:
            stmt = stmt.order_by(col.desc() if desc else col)
    else:
        stmt = stmt.order_by(Model.created_date.desc())

    stmt = stmt.limit(limit)
    return session.exec(stmt).all()
