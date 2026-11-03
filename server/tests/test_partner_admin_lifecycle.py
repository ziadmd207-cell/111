import asyncio
from io import BytesIO
import unittest

from fastapi import HTTPException
from openpyxl import load_workbook
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import (
    LearningProfile,
    Lesson,
    LessonProgress,
    Partner,
    PartnerAssessment,
    PartnerAssessmentAttempt,
    PartnerMember,
    Roadmap,
    User,
)
from app.routers.auth import login
from app.routers.partners import (
    admin_add_member,
    admin_create_partner,
    admin_delete_partner,
    admin_export_partner_students,
    admin_extend_subscription,
    admin_update_partner,
    admin_partner_student,
    partner_student_learning_context,
    partner_dashboard,
    partner_add_member,
    partner_remove_member,
    partner_student_details,
    partner_student_details,
    partner_update_learning_mode,
    partner_update_track,
    student_import_template,
    _safe_excel_value,
)


class PartnerAdminLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.admin = User(id="admin", email="admin@example.com", role="admin")
        self.session.add(self.admin)
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    @staticmethod
    async def response_bytes(response):
        return b"".join([chunk async for chunk in response.body_iterator])

    def create_partner(self, email="partner@example.com"):
        return admin_create_partner(
            {
                "name": "Example University",
                "email": email,
                "password": "secure-password",
                "institution_type": "university",
                "learning_mode": "student_discovery",
                "subscription_plan": "STARTER",
                "subscription_days": 30,
            },
            session=self.session,
            admin=self.admin,
        )

    def test_admin_created_partner_can_log_in_with_partner_entitlement(self):
        created = self.create_partner()

        response = login(
            {"email": "partner@example.com", "password": "secure-password"},
            session=self.session,
        )

        self.assertTrue(response["access_token"])
        self.assertEqual(response["user"]["role"], "partner")
        self.assertTrue(response["user"]["subscription"]["partner_managed"])
        self.assertEqual(response["user"]["subscription"]["partner_id"], created["id"])

    def test_partner_creation_rejects_removed_admin_assigned_learning_mode(self):
        with self.assertRaises(HTTPException) as raised:
            admin_create_partner(
                {
                    "name": "Legacy Mode",
                    "email": "legacy@example.com",
                    "password": "secure-password",
                    "institution_type": "university",
                    "learning_mode": "admin_assigned",
                    "subscription_plan": "PRO",
                    "subscription_days": 30,
                },
                session=self.session,
                admin=self.admin,
            )
        self.assertEqual(raised.exception.status_code, 422)

    def test_extending_suspended_partner_restores_account_login(self):
        created = self.create_partner()
        partner = self.session.get(Partner, created["id"])
        account = self.session.get(User, partner.account_user_id)
        partner.status = "suspended"
        account.status = "suspended"
        self.session.add_all([partner, account])
        self.session.commit()

        admin_extend_subscription(
            partner.id,
            {"days": 30},
            session=self.session,
            admin=self.admin,
        )

        self.session.refresh(partner)
        self.session.refresh(account)
        self.assertEqual(partner.status, "active")
        self.assertEqual(account.status, "active")
        self.assertEqual(
            login(
                {"email": account.email, "password": "secure-password"},
                session=self.session,
            )["user"]["role"],
            "partner",
        )

    def test_disabling_partner_suspends_login_account(self):
        created = self.create_partner()
        partner = self.session.get(Partner, created["id"])
        account = self.session.get(User, partner.account_user_id)

        admin_delete_partner(partner.id, session=self.session, admin=self.admin)

        self.session.refresh(account)
        self.assertEqual(account.status, "suspended")
        with self.assertRaises(HTTPException) as raised:
            login(
                {"email": account.email, "password": "secure-password"},
                session=self.session,
            )
        self.assertEqual(raised.exception.status_code, 403)

    def test_partner_without_statistics_feature_cannot_read_student_statistics(self):
        created = self.create_partner()
        partner = self.session.get(Partner, created["id"])
        owner = self.session.get(User, partner.account_user_id)
        student = admin_add_member(
            partner.id,
            {
                "member_type": "student",
                "full_name": "Partner Student",
                "email": "student@example.com",
                "password": "student-password",
                "national_id": "1234567890",
                "phone": "+201000000000",
            },
            session=self.session,
            admin=self.admin,
        )["member"]

        dashboard = partner_dashboard(user=owner, session=self.session)

        self.assertEqual(dashboard["stats"], {})
        self.assertNotIn("progress_percent", dashboard["students"][0])
        self.assertNotIn("national_id", dashboard["students"][0])
        self.assertNotIn("quiz_topics", dashboard["students"][0])
        self.assertNotIn("learning_status", dashboard["students"][0])
        self.assertNotIn("profile", dashboard["students"][0])
        with self.assertRaises(HTTPException) as raised:
            partner_student_details(
                student["id"], user=owner, session=self.session
            )
        self.assertEqual(raised.exception.status_code, 403)

    def test_partner_and_admin_student_details_include_quiz_insights_and_learning_status(self):
        created = self.create_partner()
        partner = self.session.get(Partner, created["id"])
        partner.subscription_plan = "PRO"
        partner.features = {"learning": True, "statistics": True}
        owner = self.session.get(User, partner.account_user_id)
        self.session.add(partner)
        self.session.commit()
        student = admin_add_member(
            partner.id,
            {
                "member_type": "student",
                "full_name": "Quiz Review Student",
                "email": "quiz-review@example.com",
                "password": "student-password",
            },
            session=self.session,
            admin=self.admin,
        )["member"]
        self.session.add_all([
            Roadmap(id="quiz-roadmap", user_id=student["id"], goal="Python"),
            Lesson(
                id="quiz-lesson",
                user_id=student["id"],
                roadmap_id="quiz-roadmap",
                node_id="quiz-node",
                node_title="Python foundations",
                status="in_progress",
                quiz=[
                    {"topic": "Variables", "options": ["wrong", "right"], "correct": 1},
                    {"topic": "Loops", "options": ["wrong", "right"], "correct": 1},
                ],
            ),
            LessonProgress(
                user_id=student["id"],
                lesson_id="quiz-lesson",
                status="in_progress",
                attempts=1,
                quiz_score=50,
                quiz_answers={"history": [{
                    "answers": {"0": "1", "1": "0"},
                    "score": 50,
                    "passed": False,
                    "submitted_at": "2026-11-03T10:00:00",
                    "feedback": [
                        {
                            "index": 0, "topic": "Variables", "question": "Variable question",
                            "correct": True, "correct_answer": "right",
                        },
                        {
                            "index": 1, "topic": "Loops", "question": "Loop question",
                            "correct": False, "correct_answer": "right", "explanation": "Review loops",
                        },
                    ],
                }]},
            ),
        ])
        self.session.commit()

        partner_view = partner_student_details(student["id"], user=owner, session=self.session)
        admin_view = admin_partner_student(
            partner.id, student["id"], session=self.session, admin=self.admin
        )

        for snapshot in (partner_view, admin_view):
            self.assertEqual(snapshot["learning_status"], "learning")
            self.assertEqual(snapshot["performance_band"], "needs_support")
            self.assertEqual(snapshot["quiz_attempts"][0]["feedback"][1]["student_answer"], "wrong")
            self.assertEqual(snapshot["quiz_attempts"][0]["feedback"][1]["correct_answer"], "right")
            self.assertEqual(snapshot["strength_topics"][0]["topic"], "Variables")
            self.assertEqual(snapshot["weak_topics"][0]["topic"], "Loops")

    def test_unstarted_student_has_no_performance_band(self):
        created = self.create_partner()
        partner = self.session.get(Partner, created["id"])
        partner.subscription_plan = "PRO"
        partner.features = {"learning": True, "statistics": True}
        owner = self.session.get(User, partner.account_user_id)
        self.session.add(partner)
        self.session.commit()
        student = admin_add_member(
            partner.id,
            {
                "member_type": "student",
                "full_name": "Unstarted Student",
                "email": "unstarted@example.com",
                "password": "student-password",
            },
            session=self.session,
            admin=self.admin,
        )["member"]

        snapshot = next(
            item for item in partner_dashboard(user=owner, session=self.session)["students"]
            if item["id"] == student["id"]
        )

        self.assertEqual(snapshot["learning_status"], "not_started")
        self.assertFalse(snapshot["has_learning_activity"])
        self.assertIsNone(snapshot["performance_band"])

    def test_switching_to_student_discovery_resets_unstarted_guided_profiles(self):
        created = self.create_partner()
        partner = self.session.get(Partner, created["id"])
        owner = self.session.get(User, partner.account_user_id)
        partner_update_learning_mode(
            {"discovery_enabled": False}, user=owner, session=self.session
        )
        partner_update_track(
            {"track": "Python", "skills": [], "topics": [], "instructions": ""},
            user=owner,
            session=self.session,
        )
        member = admin_add_member(
            created["id"],
            {
                "member_type": "student",
                "full_name": "Partner Student",
                "email": "student@example.com",
                "password": "student-password",
                "national_id": "1234567890",
                "phone": "+201000000000",
            },
            session=self.session,
            admin=self.admin,
        )["member"]
        profile = self.session.exec(
            select(LearningProfile).where(LearningProfile.user_id == member["id"])
        ).first()
        self.assertEqual(profile.goal, "Python")
        self.assertEqual(profile.onboarding_step, "partner_intake")

        partner_update_learning_mode(
            {"discovery_enabled": True}, user=owner, session=self.session
        )

        self.session.refresh(profile)
        self.assertIsNone(profile.goal)
        self.assertEqual(profile.target_skills, [])
        self.assertEqual(profile.onboarding_step, "discovery")

    def test_instructor_curriculum_is_saved_and_returned_for_student_intake(self):
        created = self.create_partner()
        partner = self.session.get(Partner, created["id"])
        owner = self.session.get(User, partner.account_user_id)
        student = admin_add_member(
            partner.id,
            {
                "member_type": "student",
                "full_name": "Partner Student",
                "email": "student@example.com",
                "password": "student-password",
            },
            session=self.session,
            admin=self.admin,
        )["member"]
        partner_update_learning_mode(
            {"discovery_enabled": False}, user=owner, session=self.session
        )

        saved = partner_update_track(
            {
                "track": "Data Science",
                "topics": ["Data analysis"],
                "skills": ["Python", "SQL"],
                "instructions": "Focus on practical projects.",
            },
            user=owner,
            session=self.session,
        )
        context = partner_student_learning_context(
            user=self.session.get(User, student["id"]),
            session=self.session,
        )
        profile = self.session.exec(
            select(LearningProfile).where(LearningProfile.user_id == student["id"])
        ).first()

        self.assertEqual(saved["doctor_track"]["instructions"], "Focus on practical projects.")
        self.assertTrue(context["ready"])
        self.assertEqual(context["track"], "Data Science — focus: Data analysis")
        self.assertEqual(context["skills"], ["Python", "SQL"])
        self.assertEqual(context["instructions"], "Focus on practical projects.")
        self.assertFalse(context["has_roadmap"])
        self.assertEqual(profile.onboarding_step, "partner_intake")
        self.assertEqual(partner_update_learning_mode(
            {"discovery_enabled": True}, user=owner, session=self.session
        )["learning_mode"], "student_discovery")

    def test_partner_administration_cannot_create_separate_instructor_accounts(self):
        created = self.create_partner()
        with self.assertRaises(HTTPException) as error:
            admin_add_member(
                created["id"],
                {
                    "member_type": "doctor",
                    "full_name": "Instructor",
                    "email": "instructor@example.com",
                    "password": "instructor-password",
                },
                session=self.session,
                admin=self.admin,
            )
        self.assertEqual(error.exception.status_code, 422)

    def test_legacy_doctor_is_limited_to_assigned_students(self):
        created = self.create_partner()
        partner = self.session.get(Partner, created["id"])
        partner.subscription_plan = "PRO"
        self.session.add(partner)
        self.session.commit()
        owner = self.session.get(User, partner.account_user_id)
        owner_student = partner_add_member(
            {
                "full_name": "Existing Partner Student",
                "email": "existing-student@example.com",
                "password": "student-password",
                "national_id": "12345678901235",
            },
            user=owner,
            session=self.session,
        )["member"]
        doctor = User(
            id="doctor-user",
            email="doctor@example.com",
            full_name="Partner Doctor",
            role="doctor",
            status="active",
        )
        self.session.add(doctor)
        self.session.add(PartnerMember(
            partner_id=partner.id,
            user_id=doctor.id,
            member_type="doctor",
            status="active",
        ))
        self.session.commit()

        created_student = partner_add_member(
            {
                "full_name": "Partner Student",
                "email": "partner-student@example.com",
                "password": "student-password",
                "national_id": "12345678901234",
            },
            user=doctor,
            session=self.session,
        )["member"]

        membership = self.session.exec(
            select(PartnerMember).where(PartnerMember.user_id == created_student["id"])
        ).first()
        self.assertEqual(membership.doctor_id, doctor.id)
        dashboard = partner_dashboard(user=doctor, session=self.session)
        self.assertEqual([student["id"] for student in dashboard["students"]], [created_student["id"]])
        self.assertEqual(
            partner_student_details(created_student["id"], user=doctor, session=self.session)["id"],
            created_student["id"],
        )
        with self.assertRaises(HTTPException) as details_error:
            partner_student_details(owner_student["id"], user=doctor, session=self.session)
        self.assertEqual(details_error.exception.status_code, 404)

        with self.assertRaises(HTTPException) as removal_error:
            partner_remove_member(owner_student["id"], user=doctor, session=self.session)
        self.assertEqual(removal_error.exception.status_code, 403)
        self.session.refresh(self.session.exec(
            select(PartnerMember).where(PartnerMember.user_id == owner_student["id"])
        ).first())
        self.assertEqual(
            self.session.exec(
                select(PartnerMember).where(PartnerMember.user_id == owner_student["id"])
            ).first().status,
            "active",
        )

        with self.assertRaises(HTTPException) as mode_error:
            partner_update_learning_mode(
                {"discovery_enabled": False}, user=doctor, session=self.session
            )
        self.assertEqual(mode_error.exception.status_code, 403)
        with self.assertRaises(HTTPException) as track_error:
            partner_update_track(
                {"track": "Python", "skills": ["Python"], "topics": [], "instructions": ""},
                user=doctor,
                session=self.session,
            )
        self.assertEqual(track_error.exception.status_code, 403)

        self.session.refresh(membership)
        self.assertEqual(membership.status, "active")

    def test_legacy_admin_assigned_partner_is_exposed_as_guided_mode_and_keeps_track(self):
        created = self.create_partner()
        partner = self.session.get(Partner, created["id"])
        partner.learning_mode = "admin_assigned"
        partner.assigned_track = "Python"
        self.session.add(partner)
        self.session.commit()

        admin_update_partner(
            partner.id,
            {"learning_mode": "doctor_assigned"},
            session=self.session,
            admin=self.admin,
        )
        self.session.refresh(partner)

        self.assertEqual(partner.learning_mode, "doctor_assigned")
        self.assertEqual(partner.doctor_track["track"], "Python")

    def test_excel_export_escapes_formula_values_with_leading_whitespace(self):
        self.assertEqual(_safe_excel_value("  =HYPERLINK(\"https://example.test\")"), "'  =HYPERLINK(\"https://example.test\")")

    def test_partner_export_includes_filtered_performance_and_grade_sheets(self):
        created = admin_create_partner(
            {
                "name": "Example University",
                "email": "partner@example.com",
                "password": "secure-password",
                "institution_type": "university",
                "learning_mode": "student_discovery",
                "subscription_plan": "PRO",
                "subscription_days": 30,
            },
            session=self.session,
            admin=self.admin,
        )
        partner = self.session.get(Partner, created["id"])
        owner = self.session.get(User, partner.account_user_id)
        student = admin_add_member(
            partner.id,
            {
                "member_type": "student",
                "full_name": "High Performer",
                "email": "student@example.com",
                "password": "student-password",
                "national_id": "1234567890",
            },
            session=self.session,
            admin=self.admin,
        )["member"]
        self.session.add_all([
            Roadmap(id="student-roadmap", user_id=student["id"], goal="Data Science"),
            Lesson(
                id="student-lesson",
                user_id=student["id"],
                roadmap_id="student-roadmap",
                node_id="lesson-one",
                node_title="Python basics",
                status="completed",
            ),
            LessonProgress(
                user_id=student["id"],
                lesson_id="student-lesson",
                attempts=1,
                quiz_score=95,
                quiz_answers={"history": [{"score": 95, "passed": True}]},
            ),
            PartnerAssessment(
                id="student-exam",
                partner_id=partner.id,
                created_by=self.admin.id,
                title="Final exam",
                kind="final_exam",
            ),
            PartnerAssessmentAttempt(
                id="student-exam-attempt",
                assessment_id="student-exam",
                partner_id=partner.id,
                user_id=student["id"],
                score=10,
                total_points=10,
            ),
        ])
        self.session.commit()

        response = admin_export_partner_students(
            partner.id,
            search="",
            status="all",
            performance="high",
            sort="quiz_desc",
            session=self.session,
            admin=self.admin,
        )
        workbook = load_workbook(
            BytesIO(asyncio.run(self.response_bytes(response))),
            read_only=True,
        )
        summary = list(workbook["Students"].values)

        self.assertEqual(len(summary), 2)
        self.assertEqual(summary[1][0], "High Performer")
        self.assertEqual(summary[1][9:13], (95, 100, 98, "high"))
        self.assertEqual(list(workbook["Quiz grades"].values)[1][3], 95)
        self.assertEqual(list(workbook["Exam grades"].values)[1][6], 100)

        template = student_import_template(user=owner, session=self.session)
        template_book = load_workbook(
            BytesIO(asyncio.run(self.response_bytes(template))),
            read_only=True,
        )
        self.assertEqual(
            next(template_book["Students"].values),
            ("full_name", "email", "password", "national_id", "phone", "username"),
        )
        self.assertEqual(next(template_book["Instructions"].values), ("Column", "Required", "Description"))


if __name__ == "__main__":
    unittest.main()
