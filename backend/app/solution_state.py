"""Helpers for interpreting cached solution state."""
from datetime import datetime, timedelta

from .models import Solution


ACTIVE_SOLVING_TTL = timedelta(minutes=30)
ERROR_MARKERS = (
    "error:",
    "ai call failed",
    "failed after",
    "missing question_ref",
    "traceback",
    "unterminated string",
)


def solution_has_steps(sol: Solution | None) -> bool:
    return bool(sol and sol.steps_json and sol.steps_json.strip() not in ("", "[]"))


def solution_looks_failed(sol: Solution | None) -> bool:
    if not sol or solution_has_steps(sol):
        return False
    detail = (sol.solve_status_detail or "").lower()
    if detail in {"unresolved", "failed", "generation_failed", "generation_failed_fallback"}:
        return True
    text = f"{sol.summary or ''}\n{sol.solve_log or ''}".lower()
    return any(marker in text for marker in ERROR_MARKERS)


def solution_is_stale_solving(sol: Solution | None, now: datetime | None = None) -> bool:
    if not sol or solution_has_steps(sol) or sol.status != "solving":
        return False
    if solution_looks_failed(sol):
        return True
    started_at = sol.created_at
    if not started_at:
        return False
    now = now or datetime.utcnow()
    return now - started_at > ACTIVE_SOLVING_TTL


def solution_needs_retry(sol: Solution | None) -> bool:
    if not sol:
        return True
    if solution_has_steps(sol):
        return False
    if sol.status == "solving" and not solution_is_stale_solving(sol):
        return False
    return True


def solution_ui_status(sol: Solution | None, has_steps: bool | None = None) -> str:
    has_steps = solution_has_steps(sol) if has_steps is None else has_steps
    if has_steps:
        return "solved"
    if sol and sol.status == "solving" and not solution_is_stale_solving(sol):
        return "solving"
    return "unsolved"
