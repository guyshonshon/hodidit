import json

from backend.app.solver import (
    _build_prompt,
    _missing_question_refs,
    _missing_question_requirements,
    _normalise_question_refs,
    _question_numbers,
)


def test_missing_question_refs_accepts_q_prefixed_strings():
    steps = [
        {"title": "one", "question_ref": "Q1"},
        {"title": "two", "question_ref": 2},
    ]

    _normalise_question_refs(steps)

    assert steps[0]["question_ref"] == 1
    assert _missing_question_refs(steps, [1, 2, 3]) == [3]


def test_invalid_question_refs_are_treated_as_missing():
    steps = [
        {"title": "bad", "question_ref": "1.1"},
        {"title": "none"},
    ]

    _normalise_question_refs(steps)

    assert "question_ref" not in steps[0]
    assert _missing_question_refs(steps, [1]) == [1]


def test_question_numbers_skip_only_explicitly_unselected_items():
    questions = [
        {"number": 1, "selected": True},
        {"number": 2, "selected": True, "required": False},
        {"number": 3, "selected": False, "required": False},
    ]

    assert _question_numbers(questions) == [1, 2]


def test_nested_challenge_is_required_for_selected_question():
    questions = [{
        "number": 1,
        "selected": True,
        "full_text": """## Question 1: Treasure Hunt Game

**Step 1:** Create a treasure file.
**Step 2:** Move a cursor through the file.
**Challenge:** Maintain a leaderboard of the top 10 best results in a file. Ask for the player name and insert the score in the correct position.
""",
    }]
    steps = [{
        "title": "Build treasure hunt",
        "description": "Create the treasure file and move through it",
        "content": "def play():\n    pass\n",
        "question_ref": 1,
    }]

    missing = _missing_question_requirements(steps, questions)

    assert len(missing) == 1
    assert missing[0]["question_ref"] == 1
    assert missing[0]["label"] == "Challenge"

    steps.append({
        "title": "Add leaderboard",
        "description": "Store top 10 player scores in a leaderboard file and insert the player name in order.",
        "content": "leaderboard_path = 'leaderboard.txt'\n",
        "question_ref": 1,
    })

    assert _missing_question_requirements(steps, questions) == []


def test_prompt_lists_nested_challenge_and_cursor_quality_rule():
    questions = [{
        "number": 1,
        "selected": True,
        "full_text": """## Question 1: Treasure Hunt Game

**Step 2:** Open the file in read-only mode and move a cursor.
**Challenge:** Maintain a leaderboard of the top 10 best results in a file.
""",
    }]

    prompt = _build_prompt(
        category="python",
        title="Python Mid Project",
        content="Treasure hunt project",
        questions_raw=json.dumps(questions),
        subcategory="projects",
    )

    assert "Challenge (must implement)" in prompt
    assert "use seek()/tell()/read(1)" in prompt
