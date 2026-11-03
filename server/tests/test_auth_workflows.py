from datetime import datetime, timedelta
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.core.deps import get_current_user_id, require_admin
from app.core.security import create_access_token, decode_access_token, verify_password
from app.core.config import settings
from app.main import _validate_security_settings
from app.models import User
from app.routers.auth import login, register


class AuthWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_startup_rejects_missing_or_known_weak_jwt_secret(self):
        for secret in ("", "too-short", "zeus-change-this-secret-in-production"):
            with self.subTest(secret_length=len(secret)):
                with patch.object(settings, "secret_key", secret):
                    with self.assertRaises(RuntimeError):
                        _validate_security_settings()

        with patch.object(settings, "secret_key", "random-test-secret-" * 3):
            _validate_security_settings()

    def test_registration_waits_for_activation_then_login_issues_valid_token(self):
        result = register(
            {
                "email": "learner@example.com",
                "password": "valid-password",
                "phone_country": "EG",
                "phone_number": "1012345678",
            },
            session=self.session,
            request=None,
        )
        user = self.session.get(User, result["user"]["id"])

        self.assertTrue(result["pending"])
        self.assertNotIn("access_token", result)
        self.assertNotEqual(user.password_hash, "valid-password")
        self.assertTrue(verify_password("valid-password", user.password_hash))
        with self.assertRaises(HTTPException) as pending:
            login({"email": user.email, "password": "valid-password"}, session=self.session)
        self.assertEqual(pending.exception.status_code, 403)

        user.status = "active"
        user.subscription_plan = "STARTER"
        user.subscription_status = "active"
        user.subscription_expires = datetime.utcnow() + timedelta(days=30)
        self.session.add(user)
        self.session.commit()

        authenticated = login(
            {"email": user.email, "password": "valid-password"},
            session=self.session,
        )
        self.assertEqual(decode_access_token(authenticated["access_token"]), user.id)
        self.assertTrue(authenticated["user"]["is_subscription_active"])

        with self.assertRaises(HTTPException) as invalid_password:
            login({"email": user.email, "password": "wrong-password"}, session=self.session)
        self.assertEqual(invalid_password.exception.status_code, 401)

    def test_bearer_token_and_admin_role_are_required(self):
        learner = User(
            id="learner",
            email="learner@example.com",
            status="active",
            subscription_plan="STARTER",
            subscription_status="active",
            subscription_expires=datetime.utcnow() + timedelta(days=1),
        )
        admin = User(id="admin", email="admin@example.com", role="admin", status="active")
        self.session.add_all([learner, admin])
        self.session.commit()

        with self.assertRaises(HTTPException) as missing_token:
            get_current_user_id(authorization="", session=self.session)
        self.assertEqual(missing_token.exception.status_code, 401)

        learner_token = "Bearer " + create_access_token(learner.id)
        learner_id = get_current_user_id(
            authorization=learner_token,
            session=self.session,
        )
        self.assertEqual(learner_id, learner.id)
        with self.assertRaises(HTTPException) as forbidden:
            require_admin(user_id=learner.id, session=self.session)
        self.assertEqual(forbidden.exception.status_code, 403)
        self.assertEqual(
            require_admin(user_id=admin.id, session=self.session).id,
            admin.id,
        )
