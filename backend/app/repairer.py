"""Internal solution repair loop.

All attempt/repair history is stored in AttemptLog objects and written to
Solution.internal_log. This data MUST NOT appear in final user-facing steps.

Uses get_ai_client() so it works with both OpenAI and Gemini.
"""
import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from .ai_client import call_with_retries, get_solve_client, normalise_steps
from .models import SolutionStep


_REPAIR_SYSTEM = """You are a senior DevOps engineer correcting a broken lab solution.

You receive:
1. The original lab task/exercise content
2. The solution that was attempted
3. The EXACT Python execution error (stderr + exit code from real sandbox execution)

The Python 'code' steps you produce WILL BE RE-EXECUTED in a Python sandbox.
Fix the actual bug — syntax errors, logic errors, wrong output, missing imports, etc.

RULES:
1. Return ONLY a valid JSON object — no markdown, no extra text.
2. Steps must be clean and polished — no mention of "previous attempt", "retry", or "fix".
3. Cover EVERY task from the original lab, not just the failing step.
4. Python scripts must be complete and self-contained (no missing imports or undefined vars).

Return the same JSON format as the original solver (include inferred_topic)."""


@dataclass
class AttemptLog:
    """Internal record of one solve/repair attempt. Never exposed to users."""
    attempt: int
    was_repair: bool
    error: str
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    steps_snapshot: str = "[]"

    def to_dict(self) -> dict:
        return {
            "attempt": self.attempt,
            "was_repair": self.was_repair,
            "error": self.error,
            "timestamp": self.timestamp,
            "steps_snapshot": self.steps_snapshot,
        }

    @staticmethod
    def from_dict(d: dict) -> "AttemptLog":
        return AttemptLog(
            attempt=d.get("attempt", 0),
            was_repair=d.get("was_repair", False),
            error=d.get("error", ""),
            timestamp=d.get("timestamp", ""),
            steps_snapshot=d.get("steps_snapshot", "[]"),
        )


def _build_repair_prompt(
    content: str,
    questions_raw: str,
    failed_steps: list[SolutionStep],
    error_message: str,
    category: str,
) -> str:
    questions = json.loads(questions_raw) if questions_raw else []
    q_lines = "\n".join(
        f"Q{q.get('number', i+1)}: {q.get('full_text', q.get('text', ''))}"
        for i, q in enumerate(questions[:30])
    )

    failed_json = json.dumps(
        [{"type": s.type, "title": s.title, "content": s.content,
          "output": s.output, "status": s.status}
         for s in failed_steps],
        indent=2,
    )

    return (
        f"CATEGORY: {category}\n\n"
        f"ORIGINAL LAB CONTENT:\n{content[:4000]}\n\n"
        f"EXTRACTED QUESTIONS:\n{q_lines or 'none'}\n\n"
        f"ATTEMPTED SOLUTION (failed):\n{failed_json[:3000]}\n\n"
        f"EXACT ERROR:\n{error_message[:1500]}\n\n"
        "Produce a corrected, complete solution. Return the JSON now."
    )


async def repair_solution(
    category: str,
    content: str,
    questions_raw: str,
    failed_steps: list[SolutionStep],
    error_message: str,
) -> tuple[str, list[SolutionStep]]:
    """Generate a corrected solution. Returns (summary, steps) — both clean."""
    client = get_solve_client()
    if not client:
        raise RuntimeError("Cannot repair: no AI provider configured")

    prompt = _build_repair_prompt(content, questions_raw, failed_steps, error_message, category)

    def _validate(data: dict) -> None:
        if not data.get("steps"):
            raise ValueError("Repair response missing steps")

    data = await asyncio.to_thread(
        call_with_retries,
        client=client,
        system_instruction=_REPAIR_SYSTEM,
        prompt=prompt,
        temperature=0.2,
        validate_fn=_validate,
    )

    normalise_steps(data["steps"])

    steps = [
        SolutionStep(
            id=s["id"],
            type=s["type"],
            title=s["title"],
            content=s["content"],
            output=s.get("expected_output"),
            status="pending",
        )
        for s in data["steps"]
    ]

    return data.get("summary", "Corrected solution"), steps


def collect_execution_error(steps: list[SolutionStep]) -> Optional[str]:
    """Return consolidated error from failed steps, or None if all passed."""
    errors = [
        f"Step '{s.title}' ({s.type}): {s.output or 'no output'}"
        for s in steps
        if s.status == "error"
    ]
    return "\n".join(errors) if errors else None


def serialize_logs(logs: list[AttemptLog]) -> str:
    return json.dumps([log.to_dict() for log in logs])


def deserialize_logs(raw: str) -> list[AttemptLog]:
    try:
        return [AttemptLog.from_dict(d) for d in (json.loads(raw) if raw else [])]
    except Exception:
        return []
