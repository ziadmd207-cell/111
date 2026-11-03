import asyncio
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import SubscriptionRequest, SupportRequest
from app.routers import subscriptions, support


class PublicSupportAndSubscriptionsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.request = SimpleNamespace(
            headers={},
            client=SimpleNamespace(host="support-subscription-test"),
        )

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_subscription_plans_are_loaded_from_settings_and_payment_is_persisted(self):
        plans = subscriptions.get_subscription_plans(session=self.session)
        self.assertEqual([plan["id"] for plan in plans["plans"]], ["STARTER", "PRO", "PRIME"])

        result = subscriptions.submit_subscription_payment(
            data={
                "full_name": "Maryam Ali",
                "email": "maryam@example.com",
                "phone": "01012345678",
                "plan": "PRO",
                "payment_image_url": "/uploads/receipt_123.png",
            },
            session=self.session,
            requester_id=None,
        )
        saved = self.session.get(SubscriptionRequest, result["id"])
        self.assertIsNotNone(saved)
        self.assertEqual(saved.status, "pending")
        self.assertEqual(saved.phone, "01012345678")
        self.assertEqual(saved.amount, plans["plans"][1]["price"])

        with self.assertRaises(HTTPException):
            subscriptions.submit_subscription_payment(
                data={
                    "full_name": "Maryam Ali",
                    "email": "maryam@example.com",
                    "phone": "01012345678",
                    "plan": "UNKNOWN",
                    "payment_image_url": "/uploads/receipt_123.png",
                },
                session=self.session,
                requester_id=None,
            )

    def test_prelogin_support_request_is_validated_and_saved(self):
        result = asyncio.run(support.create_support_request(
            request=self.request,
            email=" learner@example.com ",
            phone="+20 10 1234 5678",
            problem="I need help with account access.",
            images=[],
            session=self.session,
        ))
        ticket = self.session.exec(select(SupportRequest).where(SupportRequest.id == result["id"])).one()
        self.assertTrue(result["success"])
        self.assertEqual(ticket.email, "learner@example.com")
        self.assertEqual(ticket.phone, "+20 10 1234 5678")

        with self.assertRaises(HTTPException):
            asyncio.run(support.create_support_request(
                request=self.request,
                email="not-an-email",
                phone="12345678",
                problem="This request should fail.",
                images=[],
                session=self.session,
            ))
        self.assertEqual(len(self.session.exec(select(SupportRequest)).all()), 1)
