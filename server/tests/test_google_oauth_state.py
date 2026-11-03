import base64
import json
import time

from app.routers.google_auth import (
    _decrypt_phone,
    _encrypt_phone,
    _sign_state,
    _state_data,
    _verify_state,
)


def test_google_oauth_state_accepts_safe_relative_destination():
    state = _sign_state(json.dumps({"to": "/onboarding", "ts": time.time()}))

    assert _verify_state(state)["to"] == "/onboarding"


def test_google_oauth_state_rejects_tampering_expiry_and_unsafe_destination():
    valid = _sign_state(json.dumps({"to": "/app", "ts": time.time()}))
    payload, signature = valid.split(".", 1)
    tampered = base64.urlsafe_b64encode(
        json.dumps({"to": "/admin", "ts": time.time()}).encode()
    ).decode() + "." + signature
    expired = _sign_state(json.dumps({"to": "/app", "ts": time.time() - 601}))
    unsafe = _sign_state(json.dumps({"to": "//attacker.example", "ts": time.time()}))

    assert _verify_state(tampered) is None
    assert _verify_state(expired) is None
    assert _verify_state(unsafe) is None
    assert _verify_state(payload) is None


def test_phone_data_is_encrypted_in_google_state_and_can_be_recovered():
    phone = {
        "phone_country": "EG",
        "phone_country_code": "20",
        "phone_number": "1001234567",
        "phone_e164": "+201001234567",
    }
    encrypted = _encrypt_phone(phone)
    state = _sign_state(json.dumps({
        "to": "/onboarding",
        "ts": time.time(),
        "phone": encrypted,
    }))
    data = _state_data(state)

    assert data is not None
    assert phone["phone_number"] not in state
    assert _decrypt_phone(data["phone"]) == phone
    assert _decrypt_phone("not-encrypted") is None
