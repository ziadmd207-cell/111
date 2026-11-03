import asyncio
from datetime import datetime, timedelta
from io import BytesIO
import unittest
from urllib.parse import parse_qs, urlparse
import json
from unittest.mock import patch

from fastapi import HTTPException
from openpyxl import load_workbook
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.core.deps import get_current_user_id
from app.core.phone import normalize_phone
from app.core.security import create_access_token
from app.models import Lesson, LessonProgress, PartnerAssessmentAttempt, SubscriptionRequest, User
from app.routers.admin import (
    admin_export_users,
    admin_stop_user_subscription,
    admin_update_user,
    admin_users,
)
from app.routers.auth import register
from app.routers import google_auth


class AccountPhoneAndExportTests(unittest.TestCase):
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

    def test_admin_account_type_filters_separate_individuals_and_institution_accounts(self):
        users = [
            User(id="individual", email="individual@example.com", role="user", full_name="Individual"),
            User(id="partner", email="partner@example.com", role="partner", full_name="Partner"),
            User(id="doctor", email="doctor@example.com", role="doctor", full_name="Doctor"),
            User(id="partner-student", email="partner-student@example.com", role="partner_student", full_name="Partner Student"),
            User(id="admin", email="admin@example.com", role="admin", full_name="Admin"),
        ]
        self.session.add_all(users)
        self.session.commit()
        admin = self.session.get(User, "admin")

        def find_ids(account_type):
            result = admin_users(
                search="",
                account_type=account_type,
                account_status="all",
                subscription_status="all",
                plan="all",
                payment_status="all",
                completion_status="all",
                learning_status="all",
                include_admins=account_type == "admin",
                limit=200,
                offset=0,
                session=self.session,
                admin=admin,
            )
            return {item["id"] for item in result["users"]}

        self.assertEqual(find_ids("individual"), {"individual"})
        self.assertEqual(find_ids("institution"), {"partner", "doctor", "partner-student"})
        self.assertEqual(find_ids("partner_student"), {"partner-student"})
        self.assertEqual(find_ids("partner"), {"partner"})
        self.assertEqual(find_ids("doctor"), {"doctor"})
        self.assertEqual(find_ids("admin"), {"admin"})

        exported = admin_export_users(
            search="",
            account_type="partner_student",
            include_admins=False,
            session=self.session,
            admin=admin,
        )
        workbook = load_workbook(BytesIO(asyncio.run(self._response_bytes(exported))), read_only=True)
        rows = list(workbook.active.values)
        self.assertEqual([row[1] for row in rows[1:]], ["partner-student@example.com"])

        with self.assertRaises(HTTPException) as invalid_filter:
            find_ids("unknown")
        self.assertEqual(invalid_filter.exception.status_code, 400)

    def test_phone_number_is_normalized_and_rejects_bad_country_lengths(self):
        phone = normalize_phone("EG", "١٠١٢٣٤٥٦٧٨")
        self.assertEqual(phone, {
            "phone_country": "EG",
            "phone_country_code": "20",
            "phone_number": "1012345678",
            "phone_e164": "+201012345678",
        })
        with self.assertRaises(ValueError):
            normalize_phone("SA", "401234567")
        with self.assertRaises(ValueError):
            normalize_phone("US", "2025550198")

    def test_registration_persists_unique_country_aware_phone(self):
        result = register({
            "email": "new@example.com",
            "password": "valid-password",
            "phone_country": "EG",
            "phone_number": "1012345678",
        }, session=self.session, request=None)
        user = self.session.get(User, result["user"]["id"])
        self.assertEqual(user.phone_e164, "+201012345678")
        self.assertEqual(user.phone_country_code, "20")

        with self.assertRaises(HTTPException) as duplicate:
            register({
                "email": "other@example.com",
                "password": "valid-password",
                "phone_country": "EG",
                "phone_number": "1012345678",
            }, session=self.session, request=None)
        self.assertEqual(duplicate.exception.status_code, 400)

    def test_google_registration_keeps_phone_encrypted_in_oauth_state(self):
        phone = normalize_phone("EG", "1012345678")
        encrypted = google_auth._phone_cipher().encrypt(json.dumps(phone).encode()).decode()
        with patch.object(google_auth, "_google_cfg", return_value=(
            "client-id",
            "client-secret",
            "https://example.test/api/auth/google/callback",
        )):
            result = google_auth._google_auth_url("/onboarding", encrypted)

        state = parse_qs(urlparse(result["auth_url"]).query)["state"][0]
        self.assertNotIn(phone["phone_number"], state)
        state_data = google_auth._verify_state(state)
        self.assertIsNotNone(state_data)
        restored = json.loads(google_auth._phone_cipher().decrypt(state_data["phone"].encode()).decode())
        self.assertEqual(restored["phone_e164"], phone["phone_e164"])

    def test_admin_user_filters_and_excel_export_exclude_passwords(self):
        now = datetime.utcnow()
        admin = User(id="admin", email="admin@example.com", role="admin")
        paid = User(
            id="paid",
            email="paid@example.com",
            password_hash="never-export-this-hash",
            full_name="Paid User",
            phone_country="EG",
            phone_country_code="20",
            phone_number="1012345678",
            phone_e164="+201012345678",
            status="active",
            subscription_plan="PRO",
            subscription_status="active",
            subscription_start=now - timedelta(days=1),
            subscription_expires=now + timedelta(days=20),
        )
        pending = User(id="pending", email="pending@example.com", status="pending")
        self.session.add_all([
            admin,
            paid,
            pending,
            Lesson(id="done-lesson", user_id=paid.id, roadmap_id="roadmap", node_id="done", status="completed"),
            LessonProgress(
                user_id=paid.id,
                lesson_id="done-lesson",
                status="completed",
                attempts=2,
                quiz_score=90,
                quiz_answers={"history": [{"score": 70}, {"score": 90}]},
            ),
            PartnerAssessmentAttempt(
                id="paid-exam",
                assessment_id="exam",
                partner_id="partner",
                user_id=paid.id,
                score=8,
                total_points=10,
            ),
            SubscriptionRequest(
                id="paid-request",
                user_id=paid.id,
                full_name="Paid User",
                email=paid.email,
                phone=paid.phone_e164,
                plan="PRO",
                status="approved",
            ),
        ])
        self.session.commit()

        result = admin_users(
            search="201012345678",
            limit=200,
            offset=0,
            account_status="active",
            subscription_status="active",
            plan="PRO",
            payment_status="paid",
            completion_status="completed",
            session=self.session,
            admin=admin,
        )
        self.assertEqual([item["id"] for item in result["users"]], ["paid"])
        self.assertEqual(result["users"][0]["phone_e164"], "+201012345678")
        self.assertEqual(result["users"][0]["average_quiz_score"], 80)
        self.assertEqual(result["users"][0]["average_exam_score"], 80)
        self.assertEqual(result["users"][0]["performance_score"], 88)
        self.assertEqual(result["users"][0]["performance_band"], "high")

        support_needed = admin_users(
            search="",
            limit=200,
            offset=0,
            performance="needs_support",
            include_admins=False,
            session=self.session,
            admin=admin,
        )
        self.assertEqual([item["id"] for item in support_needed["users"]], ["pending"])

        response = admin_export_users(
            search="",
            account_status="all",
            subscription_status="all",
            plan="all",
            payment_status="all",
            completion_status="all",
            include_admins=False,
            session=self.session,
            admin=admin,
        )
        content = asyncio.run(self._response_bytes(response))
        worksheet = load_workbook(BytesIO(content), read_only=True).active
        rows = list(worksheet.values)
        self.assertEqual(rows[1][1], "paid@example.com")
        self.assertIn("متوسط الكويز", rows[0])
        self.assertIn("متوسط الامتحانات", rows[0])
        self.assertEqual(rows[1][16:20], (80, 80, 88, "high"))
        self.assertNotIn("password", " ".join(str(value).lower() for value in rows[0]))
        self.assertNotIn("never-export-this-hash", repr(rows))

    def test_editing_account_email_updates_linked_subscription_request(self):
        admin = User(id="admin", email="admin@example.com", role="admin")
        user = User(id="user", email="old@example.com")
        request = SubscriptionRequest(
            id="request",
            user_id=user.id,
            full_name="User",
            email=user.email,
            phone="+201012345678",
            plan="STARTER",
        )
        self.session.add_all([admin, user, request])
        self.session.commit()

        admin_update_user(user.id, {"email": "new@example.com"}, session=self.session, admin=admin)
        self.session.refresh(request)
        self.assertEqual(self.session.get(User, user.id).email, "new@example.com")
        self.assertEqual(request.email, "new@example.com")

    def test_expired_subscription_invalidates_current_session(self):
        user = User(
            id="expired",
            email="expired@example.com",
            status="active",
            subscription_plan="STARTER",
            subscription_status="active",
            subscription_expires=datetime.utcnow() - timedelta(seconds=1),
        )
        self.session.add(user)
        self.session.commit()

        with self.assertRaises(HTTPException) as expired:
            get_current_user_id(
                authorization=f"Bearer {create_access_token(user.id)}",
                session=self.session,
            )
        self.assertEqual(expired.exception.status_code, 403)
        self.assertEqual(expired.exception.headers["X-Subscription-Status"], "inactive")
        self.assertEqual(self.session.get(User, user.id).subscription_status, "expired")

    def test_stopping_subscription_suspends_account_and_updates_approved_request(self):
        admin = User(id="admin", email="admin@example.com", role="admin")
        user = User(
            id="subscribed",
            email="subscribed@example.com",
            status="active",
            subscription_plan="PRO",
            subscription_status="active",
            subscription_expires=datetime.utcnow() + timedelta(days=10),
        )
        request = SubscriptionRequest(
            id="active-request",
            user_id=user.id,
            full_name="Subscribed User",
            email=user.email,
            phone="+201012345678",
            plan="PRO",
            status="approved",
            expires_at=user.subscription_expires,
        )
        self.session.add_all([admin, user, request])
        self.session.commit()

        result = admin_stop_user_subscription(user.id, session=self.session, admin=admin)
        self.session.refresh(user)
        self.session.refresh(request)
        self.assertTrue(result["success"])
        self.assertEqual(user.status, "suspended")
        self.assertEqual(user.subscription_status, "expired")
        self.assertLessEqual(user.subscription_expires, datetime.utcnow())
        self.assertLessEqual(request.expires_at, datetime.utcnow())

    @staticmethod
    async def _response_bytes(response):
        return b"".join([chunk async for chunk in response.body_iterator])


if __name__ == "__main__":
    unittest.main()
