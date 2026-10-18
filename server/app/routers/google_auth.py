"""
Google OAuth: login + signup + callback + session + logout handling.
Flow: GET /api/auth/google/login -> Google consent ->
      GET /api/auth/google/callback?code&state -> verify, find/create user,
      issue ZEUS JWT, redirect to frontend /auth/callback?token=...
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from urllib.parse import urlencode, quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlmodel import Session, select

from ..core.config import settings
from ..core.database import get_session
from ..core.security import create_access_token
from ..models import User

router = APIRouter()

_STATE_TTL = 600
_RETURNTO_RE = re.compile(r"^/[A-Za-z0-9/_\-.]*$")


def _state_secret() -> bytes:
    raw = os.getenv("SECRET_KEY", "") or settings.secret_key
    return hashlib.sha256(raw.encode()).digest()


def _sign_state(payload: str) -> str:
    sig = hmac.new(_state_secret(), payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(payload.encode()).decode() + "." + base64.urlsafe_b64encode(sig).decode()


def _verify_state(state: str) -> str | None:
    """Return safe returnTo if signature + expiry valid, else None (fail closed)."""
    try:
        b64pay, b64sig = state.split(".", 1)
        payload = base64.urlsafe_b64decode(b64pay.encode()).decode()
        expect = hmac.new(_state_secret(), payload.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expect, base64.urlsafe_b64decode(b64sig.encode())):
            return None
        data = json.loads(payload)
        if time.time() - float(data.get("ts", 0)) > _STATE_TTL:
            return None
        dest = str(data.get("to", "/onboarding"))
        if not _RETURNTO_RE.match(dest) or ".." in dest or "\\" in dest:
            return None
        return dest
    except Exception:
        return None

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def _google_cfg():
    cid = os.getenv("GOOGLE_CLIENT_ID", "") or settings.google_client_id
    csec = os.getenv("GOOGLE_CLIENT_SECRET", "") or settings.google_client_secret
    redir = os.getenv("GOOGLE_REDIRECT_URI", "") or settings.google_redirect_uri
    if not redir:
        # sensible defaults: production domain first, then local
        redir = "https://mohamedgamal.tech/api/auth/google/callback"
    return cid, csec, redir


def _frontend_base() -> str:
    return (os.getenv("FRONTEND_URL", "") or "https://mohamedgamal.tech").rstrip("/")


@router.get("/google/login")
def google_login(returnTo: str = "/onboarding"):
    cid, _, redir = _google_cfg()
    if not cid:
        raise HTTPException(status_code=500, detail="Google login is not configured (missing Client ID)")
    # strict same-origin relative path, no query (prevents param injection)
    if not _RETURNTO_RE.match(returnTo or "") or ".." in (returnTo or ""):
        returnTo = "/onboarding"
    payload = json.dumps({"n": secrets.token_urlsafe(16), "to": returnTo, "ts": time.time()})
    state = _sign_state(payload)
    params = {
        "client_id": cid,
        "redirect_uri": redir,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return {"auth_url": f"{_GOOGLE_AUTH_URL}?{urlencode(params)}", "state": state}


@router.get("/google/callback")
async def google_callback(code: str = "", state: str = "", error: str = "", session: Session = Depends(get_session)):
    front = _frontend_base()
    if error:
        return RedirectResponse(f"{front}/login?google_error={error}", status_code=302)
    if not code:
        return RedirectResponse(f"{front}/login?google_error=no_code", status_code=302)
    cid, csec, redir = _google_cfg()
    if not cid or not csec:
        return RedirectResponse(f"{front}/login?google_error=not_configured", status_code=302)
    # Fail closed on forged/expired state (login-CSRF protection).
    returnTo = _verify_state(state)
    if not returnTo:
        return RedirectResponse(f"{front}/login?google_error=bad_state", status_code=302)
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            tok = await client.post(_GOOGLE_TOKEN_URL, data={
                "code": code,
                "client_id": cid,
                "client_secret": csec,
                "redirect_uri": redir,
                "grant_type": "authorization_code",
            })
            if tok.status_code != 200:
                return RedirectResponse(f"{front}/login?google_error=token_exchange", status_code=302)
            tokens = tok.json()
            access = tokens.get("access_token", "")
            if not access:
                return RedirectResponse(f"{front}/login?google_error=no_token", status_code=302)
            me = await client.get(_GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access}"})
            if me.status_code != 200:
                return RedirectResponse(f"{front}/login?google_error=userinfo", status_code=302)
            info = me.json()
    except Exception:
        return RedirectResponse(f"{front}/login?google_error=network", status_code=302)

    email = (info.get("email") or "").strip().lower()
    if not email:
        return RedirectResponse(f"{front}/login?google_error=no_email", status_code=302)
    # Require verified email from Google before any account link/create.
    if not info.get("verified_email") and not info.get("email_verified"):
        return RedirectResponse(f"{front}/login?google_error=unverified_email", status_code=302)
    google_id = str(info.get("sub") or "")
    if not google_id:
        return RedirectResponse(f"{front}/login?google_error=no_email", status_code=302)
    full_name = (info.get("name") or "").strip()[:100] or None
    avatar = info.get("picture") or None
    if avatar and (len(avatar) > 500 or not avatar.startswith("https://")):
        avatar = None

    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        # block suspended/pending; only merge when sub matches or no link yet
        status = getattr(user, "status", "active") or "active"
        if status == "suspended":
            return RedirectResponse(f"{front}/login?google_error=suspended", status_code=302)
        if status == "pending":
            return RedirectResponse(f"{front}/login?google_error=pending", status_code=302)
        existing_sub = getattr(user, "google_id", None)
        if existing_sub and existing_sub != google_id:
            return RedirectResponse(f"{front}/login?google_error=account_mismatch", status_code=302)
        updated = False
        if google_id and not existing_sub:
            user.google_id = google_id
            updated = True
        if avatar and not getattr(user, "avatar_url", None):
            user.avatar_url = avatar
            updated = True
        if full_name and not user.full_name:
            user.full_name = full_name
            updated = True
        if updated:
            session.add(user)
            session.commit()
    else:
        # New Google users start as pending too: no plan yet, no entry.
        # They land on login?google_error=pending until admin approves.
        user = User(
            email=email,
            password_hash="",
            full_name=full_name,
            status="pending",
            subscription_status="none",
            google_id=google_id or None,
            avatar_url=avatar,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return RedirectResponse(f"{front}/login?google_error=pending", status_code=302)

    jwt = create_access_token(user.id)
    is_admin = getattr(user, "role", "user") == "admin"
    dest = "/admin" if is_admin else returnTo
    return RedirectResponse(f"{front}/auth/callback?token={quote(jwt, safe='')}&to={quote(dest, safe='')}", status_code=302)


@router.post("/logout")
def logout():
    # Stateless HMAC JWT: server has nothing to revoke; client discards token.
    return {"success": True}
