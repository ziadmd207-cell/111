import asyncio
from datetime import datetime, timedelta
from io import BytesIO
import unittest

from fastapi import HTTPException
from openpyxl import load_workbook
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.core.security import verify_password
from app.models import (
    AdminSetting,
    Certificate,
    Community,
    CommunityMessage,
    Lesson,
    Notification,
    PartnerAssessment,
    PartnerAssessmentAttempt,
    PartnerMember,
    Roadmap,
    SubscriptionRequest,
    SupportChat,
    SupportChatMessage,
    SupportRequest,
    User,
)
from app.routers.crud import create_entity, filter_entities
from app.routers.admin import (
    admin_add_member,
    admin_approve_subscriber,
    admin_broadcast,
    admin_create_community,
    admin_community_messages,
    admin_delete_message,
    admin_pin_community_message,
    admin_send_community_message,
    admin_update_community,
    admin_reply_support_chat,
    admin_support_chat,
    admin_support_chats,
    admin_update_settings,
    admin_update_support_request,
    admin_update_user,
    admin_export_completed_users,
    admin_user_learning,
)
from app.routers.support import get_my_support_chat


class AdminWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.admin = User(id="admin", email="admin@example.com", role="admin")
        self.user = User(
            id="learner",
            email="learner@example.com",
            full_name="Learner",
            status="pending",
        )
        self.session.add_all([self.admin, self.user])
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_subscription_approval_activates_account_and_persists_notification(self):
        request = SubscriptionRequest(
            id="subscription",
            user_id=self.user.id,
            full_name=self.user.full_name,
            email=self.user.email,
            phone="+201012345678",
            plan="PRO",
            amount=199,
        )
        self.session.add(request)
        self.session.commit()

        result = admin_approve_subscriber(
            request.id,
            session=self.session,
            admin=self.admin,
        )
        self.session.refresh(request)
        self.session.refresh(self.user)
        notification = self.session.exec(
            select(Notification).where(Notification.user_id == self.user.id)
        ).one()

        self.assertTrue(result["success"])
        self.assertEqual(request.status, "approved")
        self.assertEqual(self.user.status, "active")
        self.assertEqual(self.user.subscription_plan, "PRO")
        self.assertEqual(self.user.subscription_status, "active")
        self.assertAlmostEqual(
            (self.user.subscription_expires - datetime.utcnow()).total_seconds(),
            30 * 24 * 60 * 60,
            delta=10,
        )
        self.assertEqual(notification.type, "subscription")

    def test_subscription_renewal_extends_existing_active_period(self):
        current_expiry = datetime.utcnow() + timedelta(days=20)
        self.user.status = "active"
        self.user.subscription_plan = "PRO"
        self.user.subscription_status = "active"
        self.user.subscription_expires = current_expiry
        request = SubscriptionRequest(
            id="renewal",
            user_id=self.user.id,
            full_name=self.user.full_name,
            email=self.user.email,
            phone="+201012345678",
            plan="PRO",
            amount=199,
            status="approved",
        )
        self.session.add_all([self.user, request])
        self.session.commit()

        admin_approve_subscriber(
            request.id,
            session=self.session,
            admin=self.admin,
        )
        self.session.refresh(request)
        self.session.refresh(self.user)

        self.assertEqual(request.start_date, current_expiry)
        self.assertAlmostEqual(
            (self.user.subscription_expires - datetime.utcnow()).total_seconds(),
            50 * 24 * 60 * 60,
            delta=10,
        )

    def test_completed_users_export_requires_approved_capstone_submission(self):
        complete_user = User(id="complete", email="complete@example.com", full_name="Complete Learner")
        incomplete_user = User(id="incomplete", email="incomplete@example.com", full_name="Incomplete Learner")
        roadmaps = [
            Roadmap(id="complete-track", user_id=complete_user.id, goal="Machine Learning", status="completed"),
            Roadmap(id="incomplete-track", user_id=incomplete_user.id, goal="Data Science"),
        ]
        lessons = [
            Lesson(
                id="complete-capstone",
                user_id=complete_user.id,
                roadmap_id="complete-track",
                node_id="stage_project_final",
                status="completed",
                quiz_passed=True,
                task={
                    "is_capstone_project": True,
                    "submission_text": "Final project delivered",
                    "review": {"approved": True},
                },
            ),
            Lesson(
                id="incomplete-capstone",
                user_id=incomplete_user.id,
                roadmap_id="incomplete-track",
                node_id="stage_project_final",
                status="completed",
                quiz_passed=True,
                task={"is_capstone_project": True},
            ),
        ]
        self.session.add_all([complete_user, incomplete_user, *roadmaps, *lessons])
        self.session.commit()

        response = admin_export_completed_users(session=self.session, admin=self.admin)

        async def read_body():
            return b"".join([chunk async for chunk in response.body_iterator])

        workbook = load_workbook(BytesIO(asyncio.run(read_body())))
        rows = list(workbook.active.values)
        self.assertIn(("Complete Learner", None, "complete@example.com", "Machine Learning"), rows)
        self.assertNotIn(("Incomplete Learner", None, "incomplete@example.com", "Data Science"), rows)

    def test_admin_preview_returns_certificate_and_partner_exam_results_read_only(self):
        self.user.role = "partner_student"
        membership = PartnerMember(
            id="student-membership",
            partner_id="partner",
            user_id=self.user.id,
            member_type="student",
            doctor_id="doctor",
        )
        assessment = PartnerAssessment(
            id="assessment",
            partner_id="partner",
            doctor_id="doctor",
            created_by="doctor",
            title="Python Fundamentals",
        )
        attempt = PartnerAssessmentAttempt(
            id="attempt",
            assessment_id=assessment.id,
            partner_id="partner",
            user_id=self.user.id,
            answers={"0": 1},
            score=8,
            total_points=10,
        )
        certificate = Certificate(
            id="certificate",
            user_id=self.user.id,
            sent_by_user_id=self.admin.id,
            title="Python Basics",
            file_key="certificate.pdf",
            file_name="python-basics.pdf",
            media_type="application/pdf",
            share_token="public-certificate-token",
        )
        self.session.add_all([self.user, membership, assessment, attempt, certificate])
        self.session.commit()

        result = admin_user_learning(self.user.id, session=self.session, admin=self.admin)

        self.assertEqual(result["user"]["role"], "partner_student")
        self.assertEqual(result["certificates"][0]["share_token"], "public-certificate-token")
        self.assertEqual(result["exam_results"][0]["attempts"][0]["percentage"], 80)
        self.assertNotIn("answers", result["exam_results"][0]["attempts"][0])

    def test_admin_can_assign_community_and_broadcast_notification(self):
        community_data = admin_create_community(
            {"name": "Python learners", "goal": "Python", "stage": "Beginner"},
            session=self.session,
            admin=self.admin,
        )
        community = self.session.get(Community, community_data["id"])
        admin_add_member(
            community.id,
            {"user_id": self.user.id},
            session=self.session,
            admin=self.admin,
        )
        self.session.refresh(community)
        self.assertEqual(community.members, [self.user.id])
        self.assertEqual(community.member_count, 1)

        broadcast = admin_broadcast(
            {"title": "Welcome", "body": "Start learning", "user_email": self.user.email},
            session=self.session,
            admin=self.admin,
        )
        notifications = self.session.exec(
            select(Notification).where(Notification.user_id == self.user.id)
        ).all()
        self.assertEqual(broadcast, {"sent": 1, "targeted": True})
        self.assertEqual(
            {item.type for item in notifications},
            {"community", "announcement"},
        )

    def test_targeted_broadcast_rejects_ambiguous_name_matches(self):
        first = User(id="first", email="first@example.com", full_name="Alex Example")
        second = User(id="second", email="second@example.com", full_name="Alex Example")
        self.session.add_all([first, second])
        self.session.commit()

        with self.assertRaises(HTTPException) as ambiguous:
            admin_broadcast(
                {"title": "Update", "body": "Details", "user_email": "Alex Example"},
                session=self.session,
                admin=self.admin,
            )

        self.assertEqual(ambiguous.exception.status_code, 409)

    def test_admin_can_manage_community_messages_and_close_community(self):
        self.admin.full_name = "Platform Admin"
        self.session.add(self.admin)
        self.session.commit()
        community_data = admin_create_community(
            {"name": "Python learners", "goal": "Python", "stage": "Beginner"},
            session=self.session,
            admin=self.admin,
        )
        community_id = community_data["id"]
        first = admin_send_community_message(
            community_id,
            {"text": "Welcome to the community"},
            session=self.session,
            admin=self.admin,
        )
        second = admin_send_community_message(
            community_id,
            {"text": "Please introduce yourself"},
            session=self.session,
            admin=self.admin,
        )

        self.assertEqual(first["user_email"], self.admin.email)
        self.assertEqual(first["author_name"], "Platform Admin")
        self.assertTrue(first["is_admin"])
        admin_pin_community_message(
            first["id"], {"is_pinned": True}, session=self.session, admin=self.admin
        )
        admin_pin_community_message(
            second["id"], {"is_pinned": True}, session=self.session, admin=self.admin
        )

        messages = admin_community_messages(
            community_id, session=self.session, admin=self.admin
        )
        self.assertEqual([message["text"] for message in messages], [
            "Welcome to the community",
            "Please introduce yourself",
        ])
        self.assertEqual(
            [message["is_pinned"] for message in messages],
            [False, True],
        )
        self.assertEqual(
            [message["user_email"] for message in messages],
            [self.admin.email, self.admin.email],
        )
        self.assertEqual(
            [message["author_name"] for message in messages],
            ["Platform Admin", "Platform Admin"],
        )

        updated = admin_update_community(
            community_id, {"is_closed": True}, session=self.session, admin=self.admin
        )
        self.assertTrue(updated["is_closed"])
        self.assertTrue(self.session.get(Community, community_id).is_closed)
        admin_delete_message(second["id"], session=self.session, admin=self.admin)
        self.assertEqual(
            [message["id"] for message in admin_community_messages(
                community_id, session=self.session, admin=self.admin
            )],
            [first["id"]],
        )
        self.user.status = "active"
        self.user.subscription_plan = "PRIME"
        self.user.subscription_status = "active"
        community = self.session.get(Community, community_id)
        community.members = [self.user.id]
        self.session.add_all([self.user, community])
        self.session.commit()
        with self.assertRaises(HTTPException) as closed_send:
            create_entity(
                "CommunityMessage",
                {"community_id": community_id, "text": "A member message"},
                session=self.session,
                user_id=self.user.id,
            )
        self.assertIn("closed", str(closed_send.exception).lower())

    def test_community_messages_include_member_display_names(self):
        community_data = admin_create_community(
            {"name": "Python learners", "goal": "Python", "stage": "Beginner"},
            session=self.session,
            admin=self.admin,
        )
        message = CommunityMessage(
            id="member-message",
            community_id=community_data["id"],
            user_id=self.user.id,
            user_name=self.user.email,
            text="Hello everyone",
        )
        self.session.add(message)
        self.session.commit()

        result = admin_community_messages(
            community_data["id"], session=self.session, admin=self.admin
        )

        self.assertEqual(result[0]["author_name"], "Learner")
        self.assertEqual(result[0]["user_email"], self.user.email)
        self.assertFalse(result[0]["is_admin"])

    def test_community_members_can_read_all_messages_including_admin_posts(self):
        self.user.status = "active"
        self.user.subscription_plan = "PRIME"
        self.user.subscription_status = "active"
        self.session.add(self.user)
        community_data = admin_create_community(
            {"name": "Python learners", "goal": "Python", "stage": "Beginner"},
            session=self.session,
            admin=self.admin,
        )
        community = self.session.get(Community, community_data["id"])
        community.members = [self.user.id]
        self.session.add(community)
        admin_send_community_message(
            community.id,
            {"text": "Admin announcement"},
            session=self.session,
            admin=self.admin,
        )
        self.session.commit()

        messages = filter_entities(
            "CommunityMessage",
            {"filter": {"community_id": community.id}},
            session=self.session,
            user_id=self.user.id,
        )
        self.assertEqual([message.text for message in messages], ["Admin announcement"])

    def test_support_chat_admin_read_and_reply_persist_and_update_unread_counts(self):
        chat = SupportChat(
            id="chat",
            user_id=self.user.id,
            name=self.user.full_name,
            email=self.user.email,
            status="open",
            unread_admin=1,
            unread_user=0,
        )
        first_message = SupportChatMessage(
            id="user-message",
            chat_id=chat.id,
            sender_type="user",
            sender_user_id=self.user.id,
            text="I need help",
        )
        self.session.add_all([chat, first_message])
        self.session.commit()

        chats = admin_support_chats(limit=100, session=self.session, admin=self.admin)
        self.assertEqual(chats[0]["last_message"]["text"], "I need help")

        result = admin_support_chat(chat.id, session=self.session, admin=self.admin)
        self.session.refresh(chat)
        self.assertEqual(result["messages"][0]["text"], "I need help")
        self.assertEqual(chat.unread_admin, 0)

        reply = asyncio.run(admin_reply_support_chat(
            chat.id,
            text="We can help",
            files=[],
            session=self.session,
            admin=self.admin,
        ))
        self.session.refresh(chat)
        saved_messages = self.session.exec(
            select(SupportChatMessage)
            .where(SupportChatMessage.chat_id == chat.id)
            .order_by(SupportChatMessage.created_date)
        ).all()
        self.assertEqual(reply["message"]["text"], "We can help")
        self.assertEqual(reply["chat"]["id"], chat.id)
        self.assertEqual(saved_messages[-1].sender_type, "admin")
        self.assertEqual(chat.unread_user, 1)

    def test_support_request_status_change_is_saved(self):
        request = SupportRequest(
            id="ticket",
            email=self.user.email,
            phone="+201012345678",
            problem="Please help",
            status="open",
        )
        self.session.add(request)
        self.session.commit()

        result = admin_update_support_request(
            request.id,
            {"status": "resolved"},
            session=self.session,
            admin=self.admin,
        )
        self.session.refresh(request)
        self.assertEqual(result["status"], "resolved")
        self.assertEqual(request.status, "resolved")

    def test_user_support_chat_read_returns_messages_after_marking_them_read(self):
        chat = SupportChat(
            id="user-chat",
            user_id=self.user.id,
            name=self.user.full_name,
            email=self.user.email,
            unread_user=1,
        )
        message = SupportChatMessage(
            id="admin-message",
            chat_id=chat.id,
            sender_type="admin",
            text="How can we help?",
        )
        self.session.add_all([chat, message])
        self.session.commit()

        result = get_my_support_chat(session=self.session, user_id=self.user.id)
        self.session.refresh(chat)

        self.assertEqual(result["messages"][0]["text"], "How can we help?")
        self.assertEqual(result["chat"]["unread_user"], 0)
        self.assertEqual(chat.unread_user, 0)

    def test_platform_settings_and_password_reset_are_persisted(self):
        admin_update_settings(
            {
                "starter_price": 123,
                "currency": "USD",
                "subscription_contact_email": "billing@example.com",
                "facebook_url": "https://facebook.com/example",
                "clear_secrets": [],
            },
            session=self.session,
            admin=self.admin,
        )
        setting = self.session.get(AdminSetting, "default")
        self.assertEqual(setting.starter_price, 123)
        self.assertEqual(setting.currency, "USD")
        self.assertEqual(setting.subscription_contact_email, "billing@example.com")
        self.assertEqual(setting.facebook_url, "https://facebook.com/example")

        admin_update_user(
            self.user.id,
            {"password": "new-strong-password"},
            session=self.session,
            admin=self.admin,
        )
        self.session.refresh(self.user)
        self.assertTrue(verify_password("new-strong-password", self.user.password_hash))

    def test_platform_settings_reject_invalid_prices_and_currency_codes(self):
        for field, value in (
            ("starter_price", -1),
            ("pro_price", float("inf")),
            ("prime_price", True),
            ("currency", "US"),
        ):
            with self.subTest(field=field, value=value):
                with self.assertRaises(HTTPException) as invalid:
                    admin_update_settings(
                        {field: value},
                        session=self.session,
                        admin=self.admin,
                    )
                self.assertEqual(invalid.exception.status_code, 400)

        self.assertIsNone(self.session.get(AdminSetting, "default"))


if __name__ == "__main__":
    unittest.main()
