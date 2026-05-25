"""Exercise classifier — determines exercise type before solving.

Uses fast regex pattern matching first; falls back to AI when inconclusive.

IMPORTANT: 'intentional_error' is NEVER returned by pattern matching alone —
it always requires AI confirmation because false positives block the repair loop.
"""
import asyncio
import json
import re
from enum import Enum
from typing import Optional

from .ai_client import call_with_retries, get_classify_client, get_classify_fallback_client


class ExerciseType(Enum):
    normal = "normal"
    requires_generation = "requires_generation"
    intentional_error = "intentional_error"
    ambiguous_manual_review = "ambiguous_manual_review"


_GENERATION_PATTERNS = [
    r"click\s+(?:here\s+)?to\s+generate",
    r"press\s+(?:the\s+)?generate",
    r"generate\s+(?:the\s+)?(?:question|exercise|lab|task)",
    r"click\s+generate",
    r"generate\s+button",
    r"generate\s+to\s+reveal",
]

# Only used as a HINT passed to the AI — never as a definitive classification.
# intentional_error patterns are too noisy for regex alone.
_INTENTIONAL_ERROR_HINTS = [
    r"trigger\s+(?:an?\s+)?error",
    r"cause\s+(?:an?\s+)?error",
    r"observe\s+(?:the\s+)?error",
    r"what\s+(?:error|exception)\s+(?:do\s+you|occurs|is\s+raised|will)",
    r"demonstrate\s+(?:the\s+)?(?:error|failure|exception)",
    r"show\s+(?:the\s+)?error",
    r"produce\s+(?:an?\s+)?error",
    r"expected\s+(?:to\s+)?fail",
    r"should\s+(?:produce|raise|return)\s+(?:an?\s+)?error",
    r"intentionally\s+(?:broken|fail|wrong)",
    r"break\s+(?:the\s+)?(?:script|code|command)",
]

_AMBIGUOUS_PATTERNS = [
    r"\btbd\b",
    r"to\s+be\s+determined",
    r"coming\s+soon",
    r"\bplaceholder\b",
    r"lorem\s+ipsum",
]

_CLASSIFICATION_SYSTEM = """You are a lab exercise classifier for a DevOps training platform.

Classify the exercise into exactly one of:
- "normal": well-defined content, solvable directly
- "requires_generation": placeholder/stub; real questions appear only after clicking Generate
- "intentional_error": EXPLICITLY asks student to trigger/observe broken output as the goal
- "ambiguous_manual_review": contradictory, severely incomplete, or unclassifiable

IMPORTANT RULES:
- Only classify as "requires_generation" if the content ITSELF explicitly says to click a
  Generate button (e.g. "Click Generate to reveal your questions"). If the prompt says
  "Pattern scan: NO generate button detected", you MUST NOT return requires_generation.
- Only classify as "intentional_error" if the primary goal is to produce failing/broken output.
  Exercises that merely mention errors or handle exceptions normally are still "normal".
- When in doubt, prefer "normal".

Return ONLY valid JSON: {"type": "<value>", "reasoning": "<one sentence>"}"""


def _pattern_classify(content: str, questions_raw: str) -> Optional[ExerciseType]:
    """Fast pattern match for generation/ambiguous only. Never returns intentional_error."""
    text = (content + " " + (questions_raw or "")).lower()

    for pat in _GENERATION_PATTERNS:
        if re.search(pat, text, re.IGNORECASE):
            return ExerciseType.requires_generation

    for pat in _AMBIGUOUS_PATTERNS:
        if re.search(pat, text, re.IGNORECASE):
            return ExerciseType.ambiguous_manual_review

    questions = json.loads(questions_raw) if questions_raw else []
    if len(content.strip()) < 200 and not questions:
        return ExerciseType.requires_generation

    return None


def _has_intentional_error_hint(content: str, questions_raw: str) -> bool:
    text = (content + " " + (questions_raw or "")).lower()
    return any(re.search(p, text, re.IGNORECASE) for p in _INTENTIONAL_ERROR_HINTS)


def _has_solvable_structure(content: str, questions_raw: str) -> bool:
    """True when local parsing already found concrete task/question structure."""
    try:
        questions = json.loads(questions_raw) if questions_raw else []
    except Exception:
        questions = []
    if questions:
        return True
    return bool(re.search(r"\b(task|exercise|question|lab)\b", content, re.IGNORECASE))


async def classify_exercise(
    content: str,
    questions_raw: str,
    title: str,
    category: str,
    subcategory: str = "",
) -> tuple[ExerciseType, str]:
    """Classify exercise type. Returns (ExerciseType, reasoning string).

    Pattern matching handles generation/ambiguous quickly.
    intentional_error always requires AI confirmation.
    """
    # Lessons are explanatory content — never ambiguous, always solvable as normal
    if subcategory == "lessons":
        print(f"[classifier] Lesson → '{title}': normal (lessons always normal)")
        return ExerciseType.normal, "Lesson content — treated as normal"

    fast = _pattern_classify(content, questions_raw)
    if fast is not None:
        reason = f"Pattern match → {fast.value}"
        print(f"[classifier] Pattern → '{title}': {fast.value}")
        return fast, reason

    if _has_solvable_structure(content, questions_raw) and not _has_intentional_error_hint(content, questions_raw):
        print(f"[classifier] Heuristic → '{title}': normal")
        return ExerciseType.normal, "Structured questions/tasks found — treated as normal"

    client = get_classify_client()
    if not client:
        # No AI: can't safely detect intentional_error — default to normal
        if _has_intentional_error_hint(content, questions_raw):
            print(f"[classifier] No AI, intentional_error hint for '{title}' — defaulting to normal")
        return ExerciseType.normal, "No AI client — defaulted to normal"

    # Provide a cheap OpenAI fallback if the primary client is Gemini and hits rate limits.
    fallback = (
        get_classify_fallback_client()
        if getattr(client, "provider", None) == "gemini"
        else None
    )

    try:
        questions = json.loads(questions_raw) if questions_raw else []
        q_summary = "\n".join(
            f"Q{q.get('number', i+1)}: {q.get('text', '')}"
            for i, q in enumerate(questions[:10])
        ) or "none"

        error_hint = (
            "\nNote: some phrases suggest this might be intentional_error — verify carefully."
            if _has_intentional_error_hint(content, questions_raw) else ""
        )

        # Tell the AI what the regex scan found so it can't second-guess it
        generation_scan = (
            "Pattern scan: generate-button text/HTML FOUND in content → may require generation."
            if any(re.search(p, content, re.IGNORECASE) for p in _GENERATION_PATTERNS)
            else "Pattern scan: NO generate button detected — do NOT classify as requires_generation."
        )

        q_count_note = f"({len(questions)} question(s) extracted)" if questions else "(no questions extracted)"

        prompt = (
            f"Title: {title}\nCategory: {category}\n"
            f"{generation_scan}\n"
            f"Extracted questions {q_count_note}:\n{q_summary}\n\n"
            f"Content (first 2000 chars):\n{content[:2000]}{error_hint}"
        )

        data = await asyncio.to_thread(
            call_with_retries,
            client=client,
            system_instruction=_CLASSIFICATION_SYSTEM,
            prompt=prompt,
            temperature=0.05,
            max_tokens=256,
            fallback_client=fallback,
        )

        result = ExerciseType(data.get("type", "normal"))
        reasoning = data.get("reasoning", "")
        print(f"[classifier] AI → '{title}': {result.value} — {reasoning}")
        return result, reasoning

    except Exception as exc:
        print(f"[classifier] AI classification failed for '{title}': {exc}")
        return ExerciseType.normal, f"Classification error: {exc}"
