import asyncio
import base64
import os
import uuid
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from types import SimpleNamespace

from app.routers.functions import (
    PASS_SCORE,
    QUIZ_ESSAY_QUESTIONS,
    QUIZ_MCQ_QUESTIONS,
    QUIZ_TARGET_QUESTIONS,
    _is_high_quality_question,
    _is_valid_question,
)
from app.routers import crud as crud_router, functions as functions_router
from app.services import llm
from app.services.quiz import calculate_quiz_score, student_question


class QuizContractTests(unittest.TestCase):
    def test_chat_images_are_limited_to_uploaded_images(self):
        with self.assertRaises(HTTPException) as raised:
            functions_router._load_chat_images([{
                "role": "user",
                "content": "What is this?",
                "images": ["https://example.com/image.png"],
            }])
        self.assertEqual(raised.exception.status_code, 422)

    def test_chat_images_are_loaded_from_upload_storage(self):
        filename = f"{uuid.uuid4().hex}.png"
        uploads_dir = os.path.abspath(os.path.join(os.path.dirname(functions_router.__file__), "../../../uploads"))
        path = os.path.join(uploads_dir, filename)
        try:
            with open(path, "wb") as image_file:
                image_file.write(b"\x89PNG\r\n\x1a\nexample")
            images = functions_router._load_chat_images([{
                "role": "user",
                "content": "Describe this",
                "images": [f"/uploads/{filename}"],
            }])
            self.assertEqual(images[0]["mime_type"], "image/png")
            self.assertEqual(base64.b64decode(images[0]["data"]), b"\x89PNG\r\n\x1a\nexample")
        finally:
            if os.path.exists(path):
                os.remove(path)

    def test_quiz_contract_has_twenty_five_mcq_and_five_essay_questions(self):
        self.assertEqual(QUIZ_MCQ_QUESTIONS, 25)
        self.assertEqual(QUIZ_ESSAY_QUESTIONS, 5)
        self.assertEqual(QUIZ_TARGET_QUESTIONS, 30)
        self.assertEqual(PASS_SCORE, 80)

    def test_essay_questions_require_a_rubric_and_expected_answer(self):
        question = {
            "type": "essay",
            "question": "Explain why this approach fits the lesson objective.",
            "expected_answer": "A complete answer connects the approach to the stated objective.",
            "grading_criteria": ["Explains the approach", "Connects it to the lesson objective"],
            "explanation": "A strong explanation describes both the method and its purpose.",
        }
        self.assertTrue(_is_valid_question(question))
        self.assertTrue(_is_high_quality_question(question))
        self.assertFalse(_is_valid_question({**question, "grading_criteria": []}))

    def test_student_quiz_payload_does_not_expose_answer_keys(self):
        public = student_question({
            "type": "essay",
            "question": "Explain the concept.",
            "expected_answer": "The private expected answer.",
            "grading_criteria": ["Criterion one", "Criterion two"],
            "correct": 2,
            "explanation": "The explanation is revealed after grading.",
        })
        self.assertEqual(public, {"type": "essay", "question": "Explain the concept."})

    def test_starter_schedule_payload_does_not_expose_lesson_media_or_content(self):
        lesson = SimpleNamespace(model_dump=lambda: {
            "id": "lesson-1",
            "roadmap_id": "roadmap-1",
            "node_id": "node-1",
            "node_title": "Lesson title",
            "phase": 1,
            "day": "monday",
            "week": 1,
            "order": 1,
            "status": "available",
            "video_url": "https://youtube.com/watch?v=abcdefghijk",
            "reading_content": "Private lesson content",
            "quiz": [{"question": "Question", "correct": 0}],
        })

        payload = crud_router._serialize_entity("Lesson", lesson, can_access_pro=False)

        self.assertEqual(payload["node_title"], "Lesson title")
        self.assertNotIn("video_url", payload)
        self.assertNotIn("reading_content", payload)
        self.assertNotIn("quiz", payload)

    def test_starter_roadmap_payload_hides_lesson_resources(self):
        roadmap = SimpleNamespace(model_dump=lambda: {
            "id": "roadmap-1",
            "nodes": [{"id": "node-1", "title": "Lesson", "resources": [{"url": "https://youtube.com/watch?v=abcdefghijk"}]}],
        })

        payload = crud_router._serialize_entity("Roadmap", roadmap, can_access_pro=False)

        self.assertEqual(payload["nodes"][0]["resources"], [])
        self.assertEqual(payload["nodes"][0]["title"], "Lesson")

    def test_starter_cannot_fetch_a_lesson_by_id_from_the_backend(self):
        user = SimpleNamespace(role="user")
        session = SimpleNamespace(get=lambda model, user_id: user)
        lesson = SimpleNamespace(node_id="lesson-1")
        with (
            patch.object(crud_router, "_is_admin", return_value=False),
            patch.object(crud_router, "get_user_subscription_info", return_value={"tier": "STARTER", "status": "active"}),
            self.assertRaises(HTTPException) as raised,
        ):
            crud_router._enforce_lesson_tier(lesson, "user-1", session)

        self.assertEqual(raised.exception.status_code, 403)

    def test_partial_essay_credit_does_not_round_a_failing_score_up_to_passing(self):
        self.assertEqual(calculate_quiz_score(23.99, 30, 80), (79, False))
        self.assertEqual(calculate_quiz_score(24, 30, 80), (80, True))

    def test_essay_generation_uses_the_lesson_specific_rubric_contract(self):
        questions = [
            {
                "type": "essay",
                "question": f"Explain lesson concept {index} in your own words.",
                "expected_answer": f"A complete explanation of lesson concept {index} is expected.",
                "grading_criteria": ["Explains the concept", "Connects it to the lesson"],
                "explanation": "A complete response explains the concept and applies it to the lesson.",
            }
            for index in range(5)
        ]
        with patch.object(llm, "_call_openai", new_callable=AsyncMock, return_value={"questions": questions}) as call:
            result = asyncio.run(llm.generate_quiz_from_content("lesson content", "en", 5, "essay"))

        self.assertEqual(len(result["questions"]), 5)
        self.assertEqual(call.await_args.args[2]["properties"]["questions"]["items"]["required"], [
            "question", "type", "expected_answer", "grading_criteria", "explanation",
        ])

    def test_essay_grading_requires_an_evaluation_for_every_response(self):
        questions = [
            {
                "question": "Explain this lesson concept.",
                "expected_answer": "The answer explains the concept using the lesson.",
                "grading_criteria": ["Defines it", "Explains its use"],
            }
        ]
        with patch.object(llm, "_call_openai", new_callable=AsyncMock, return_value={
            "evaluations": [{"index": 0, "score": 0.75, "feedback": "Good explanation; add one example."}]
        }) as call:
            result = asyncio.run(llm.grade_quiz_essays(questions, ["It is used this way."], "en"))

        self.assertEqual(result["evaluations"][0]["score"], 0.75)
        self.assertEqual(call.await_args.kwargs["task"], "assessment")


if __name__ == "__main__":
    unittest.main()
