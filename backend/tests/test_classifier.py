import asyncio
import json

from backend.app.classifier import ExerciseType, classify_exercise


def test_structured_normal_lab_does_not_require_ai_classifier(monkeypatch):
    def fail_if_called():
        raise AssertionError("AI classifier should not be called for structured normal labs")

    monkeypatch.setattr("backend.app.classifier.get_classify_client", fail_if_called)

    exercise_type, reason = asyncio.run(classify_exercise(
        content="### Question 1\nWhat is Docker?\n",
        questions_raw=json.dumps([{"number": 1, "text": "What is Docker?"}]),
        title="Docker Lab",
        category="docker",
        subcategory="labs",
    ))

    assert exercise_type is ExerciseType.normal
    assert "Structured questions" in reason


def test_generate_pattern_still_wins_before_normal_heuristic():
    exercise_type, _ = asyncio.run(classify_exercise(
        content="Click Generate to reveal your questions.",
        questions_raw="[]",
        title="Generated Homework",
        category="linux",
        subcategory="homework",
    ))

    assert exercise_type is ExerciseType.requires_generation
