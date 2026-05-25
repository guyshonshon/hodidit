from datetime import datetime, timedelta

from backend.app.models import Solution
from backend.app.solution_state import solution_is_stale_solving, solution_needs_retry, solution_ui_status


def test_error_log_solving_solution_is_retryable_and_shown_unsolved():
    sol = Solution(
        lab_slug="docker-lab",
        status="solving",
        steps_json="[]",
        summary="AI call failed after 3 attempts: Missing question_ref for question(s): [9]",
        solve_log="[11:45:12] ERROR: AI call failed after 3 attempts",
    )

    assert solution_needs_retry(sol) is True
    assert solution_ui_status(sol) == "unsolved"


def test_recent_active_solving_solution_is_not_requeued():
    sol = Solution(
        lab_slug="active",
        status="solving",
        steps_json="[]",
        created_at=datetime.utcnow(),
    )

    assert solution_is_stale_solving(sol) is False
    assert solution_needs_retry(sol) is False
    assert solution_ui_status(sol) == "solving"


def test_old_empty_solving_solution_is_stale():
    sol = Solution(
        lab_slug="old",
        status="solving",
        steps_json="[]",
        created_at=datetime.utcnow() - timedelta(minutes=45),
    )

    assert solution_is_stale_solving(sol) is True
    assert solution_needs_retry(sol) is True
