ANSWER_KEY_FIELDS = {"correct", "expected_answer", "grading_criteria", "explanation"}


def student_question(question: dict) -> dict:
    return {
        key: value
        for key, value in question.items()
        if key not in ANSWER_KEY_FIELDS
    }


def calculate_quiz_score(earned_points: float, total_points: int, passing_score: int) -> tuple[int, bool]:
    if total_points <= 0 or not 0 <= earned_points <= total_points:
        raise ValueError("Quiz points must be within the quiz total")
    percentage = earned_points / total_points * 100
    return int(percentage), percentage >= passing_score
