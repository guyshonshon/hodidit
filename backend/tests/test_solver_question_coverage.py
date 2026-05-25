from backend.app.solver import _missing_question_refs, _normalise_question_refs, _question_numbers


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
