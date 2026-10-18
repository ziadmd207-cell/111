"""
Real auth (stdlib only, no extra deps):
- Passwords: PBKDF2-HMAC-SHA256 with per-user salt.
- Tokens: HMAC-SHA256 signed "user_id.expiry.signature" (base64url).
No email verification (per product decision).
"""
import base64
import hashlib
import hmac
import secrets
import time

from .config import settings

_ITERATIONS = 200_000
_TOKEN_TTL_SECONDS = 7 * 24 * 3600


def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64d(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2${_ITERATIONS}${_b64e(salt)}${_b64e(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_b64, digest_b64 = stored.split("$")
        if algo != "pbkdf2":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), _b64d(salt_b64), int(iters))
        return hmac.compare_digest(_b64e(digest), digest_b64)
    except Exception:
        return False


def _secret() -> bytes:
    return settings.secret_key.encode()


def create_access_token(user_id: str) -> str:
    expiry = int(time.time()) + _TOKEN_TTL_SECONDS
    payload = f"{user_id}.{expiry}".encode()
    sig = hmac.new(_secret(), payload, hashlib.sha256).digest()
    return f"{_b64e(payload)}.{_b64e(sig)}"


def decode_access_token(token: str) -> str | None:
    """Return user_id if token is valid and unexpired, else None."""
    try:
        payload_b64, sig_b64 = token.split(".")
        payload = _b64d(payload_b64)
        expected = hmac.new(_secret(), payload, hashlib.sha256).digest()
        if not hmac.compare_digest(_b64e(expected), sig_b64):
            return None
        user_id, expiry = payload.decode().rsplit(".", 1)
        if int(expiry) < int(time.time()):
            return None
        return user_id
    except Exception:
        return None
