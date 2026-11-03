import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.routers import crud, functions


class PartnerEntitlementTests(unittest.TestCase):
    def setUp(self):
        self.user = SimpleNamespace(id="student-1", role="partner_student")
        self.session = SimpleNamespace(get=lambda _model, _user_id: self.user)
        self.subscription = {
            "partner_managed": True,
            "tier": "STARTER",
            "status": "active",
        }

    def test_partner_feature_override_replaces_commercial_entity_tier(self):
        with (
            patch.object(crud, "get_user_subscription_info", return_value=self.subscription),
            patch.object(crud, "partner_feature_enabled", return_value=True),
        ):
            crud._enforce_tier("Community", self.user.id, self.session)

    def test_disabled_partner_feature_blocks_entity_access(self):
        with (
            patch.object(crud, "get_user_subscription_info", return_value=self.subscription),
            patch.object(crud, "partner_feature_enabled", return_value=False),
            self.assertRaises(HTTPException) as raised,
        ):
            crud._enforce_tier("Community", self.user.id, self.session)
        self.assertEqual(raised.exception.status_code, 403)

    def test_partner_learning_and_projects_use_independent_feature_flags(self):
        with (
            patch.object(crud, "get_user_subscription_info", return_value=self.subscription),
            patch.object(crud, "partner_feature_enabled", side_effect=lambda _u, _s, feature: feature == "learning"),
        ):
            crud._enforce_lesson_tier(SimpleNamespace(), self.user.id, self.session)
            self.assertTrue(crud._can_access_learning_content("Lesson", self.user.id, self.session))
            self.assertFalse(crud._can_access_stage_projects(self.user.id, self.session))

    def test_partner_function_feature_override_replaces_commercial_tier(self):
        with (
            patch.object(functions, "get_user_subscription_info", return_value=self.subscription),
            patch.object(functions, "partner_feature_enabled", return_value=True),
        ):
            functions._enforce_function_tier("PRIME", self.user.id, self.session, "Career")


if __name__ == "__main__":
    unittest.main()
