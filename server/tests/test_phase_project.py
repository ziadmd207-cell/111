import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.routers import functions


class ProjectSession:
    def __init__(self, lesson):
        self.lesson = lesson
        self.added = []

    def get(self, model, item_id):
        return self.lesson

    def exec(self, statement):
        return SimpleNamespace(first=lambda: None)

    def add(self, item):
        self.added.append(item)

    def commit(self):
        pass

    def refresh(self, item):
        pass


class PhaseProjectTests(unittest.TestCase):
    def setUp(self):
        self.lesson = SimpleNamespace(
            id="project-lesson",
            user_id="user-1",
            roadmap_id="roadmap-1",
            node_id="stage_project_1",
            node_title="Cumulative project",
            status="available",
            task={"title": "Build a project", "description": "Complete the phase project", "steps": ["Build", "Test"]},
            quiz_passed=False,
            quiz_score=None,
            completed_date=None,
        )
        self.session = ProjectSession(self.lesson)
        self.access_patches = (
            patch.object(functions, "_enforce_stage_project_access"),
            patch.object(functions, "_enforce_lesson_unlocked"),
        )
        for patcher in self.access_patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def submit(self):
        return asyncio.run(functions.submit_phase_project(
            {
                "lessonId": self.lesson.id,
                "submission_text": "I built and tested the requested project.",
                "lang": "en",
            },
            self.session,
            "user-1",
        ))

    def test_project_review_failure_does_not_turn_into_a_rejection(self):
        with patch("app.services.llm.review_project_agent", new_callable=AsyncMock, return_value={
            "error": "temporary",
            "retry": True,
        }):
            result = self.submit()

        self.assertTrue(result["retry"])
        self.assertEqual(result["error"], "temporary")
        self.assertEqual(self.lesson.status, "available")
        self.assertNotIn("review", self.lesson.task)

    def test_project_below_seventy_percent_does_not_unlock_the_next_lesson(self):
        with (
            patch("app.services.llm.review_project_agent", new_callable=AsyncMock, return_value={
                "score": 69.9,
                "feedback": "Add the missing test and explain the result.",
            }),
            patch.object(functions, "_unlock_next_lesson") as unlock,
        ):
            result = self.submit()

        self.assertFalse(result["approved"])
        self.assertEqual(result["score"], 69)
        self.assertEqual(self.lesson.status, "available")
        unlock.assert_not_called()

    def test_project_at_seventy_percent_marks_complete_and_unlocks_next_lesson(self):
        with (
            patch("app.services.llm.review_project_agent", new_callable=AsyncMock, return_value={
                "score": 70,
                "feedback": "The project meets the phase requirements.",
            }),
            patch.object(functions, "_unlock_next_lesson", return_value="next-lesson") as unlock,
        ):
            result = self.submit()

        self.assertTrue(result["approved"])
        self.assertEqual(result["next_lesson_id"], "next-lesson")
        self.assertEqual(self.lesson.status, "completed")
        self.assertTrue(self.lesson.quiz_passed)
        unlock.assert_called_once_with(self.session, "user-1", "roadmap-1", "project-lesson")


if __name__ == "__main__":
    unittest.main()
