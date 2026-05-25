"""AI-powered solver — provider-agnostic, cache-first.

Topic inference
───────────────
The solver asks the AI to identify the actual subject topic (linux, python, git,
docker, kubernetes, etc.) from the exercise content itself. This is returned as
`inferred_topic` and stored on the Lab as `ai_topic`, so homework on python topics
is correctly labelled "python" rather than "homework".

Replay / caching
────────────────
Once steps are stored they are replayed directly — the AI is never called again
for the same exercise unless `force=True` is passed to the solve endpoint.
"""
import asyncio
import json

from .ai_client import call_with_retries, get_solve_client, get_solve_provider_label, normalise_steps
from .models import SolutionStep


# ── System instruction ──────────────────────────────────────────────────────

SYSTEM_INSTRUCTION = """You are a senior DevOps/Linux/Python/Git/Docker engineer and educator.

Your task: analyze the given lab, homework, or project content and produce a complete, executable solution.
The exercise may belong to any DevOps/programming topic — identify it from the content.

IMPORTANT — Python code steps are ACTUALLY EXECUTED to verify correctness:
- 'code' steps (Python scripts) are run in a sandbox. Real stdout is captured.
  If the script raises an exception or exits non-zero, the AI is called to fix it.
  Write Python that actually works — not pseudocode or placeholders.
- 'command', 'git', 'docker' steps are NOT executed; the output field is shown as-is.

STRICT OUTPUT RULES:
1. Return ONLY a single valid JSON object — no markdown fences, no prose outside JSON.
2. Every step MUST be actionable and complete.
3. For 'command' steps: content = exact bash/shell command(s). Output = expected terminal output.
4. For 'git' steps: content = exact git command(s). Output = expected terminal output.
5. For 'docker' steps: content = exact docker/docker-compose command(s). Output = expected output.
6. For 'code' steps: content = a complete, self-contained Python script that runs without error.
7. NEVER use 'explanation' type. All context and explanation goes in the 'description' field.
8. Cover EVERY numbered task/question from the lab — do not skip any.
9. Keep steps granular — one command, file, milestone, or code block per step.
10. Use standard assumptions: Ubuntu 22.04, bash shell, git 2.x, Python 3.10+, Docker 24+.
11. Set 'question_ref' to the question number this step answers (required for all steps).
12. For Python scripts: write complete, runnable code. The output field should show what
    the script prints when run successfully.

PYTHON CODE STYLE — CRITICAL:
13. Write EXPLICIT, MANUAL implementations. Do NOT use shortcuts, built-in functions, or library
    one-liners when the exercise is testing understanding of the underlying logic.
    BAD:  result = max(x, y, z)
    GOOD: if x >= y and x >= z:
              result = x
          elif y >= z:
              result = y
          else:
              result = z
14. The same applies to: sorting (no sort()/sorted()), searching (no 'in' keyword for manual
    search tasks), string reversal (no [::-1] for reversal exercises), sum/min/max/count when
    the exercise clearly wants manual iteration, etc.
15. Only use built-ins/libraries when the exercise explicitly asks to use them or when the
    topic is about learning that specific library (e.g., a numpy/pandas exercise).

EXAMPLE_INPUTS rule (CRITICAL for interactive code):
- If a 'code' step contains input() calls, you MUST include 'example_inputs': a JSON object
  mapping each variable that receives input() directly to a realistic example value string.
- The 'output' field MUST show what the program prints when run with those example_inputs.
  Do NOT put input prompts in 'output' — only print() results.
- Example: code has `num = input("Enter: ")` → "example_inputs": {"num": "42"}, "output": "42"
- For type-cast input like `x = int(input("Enter: "))` → "example_inputs": {"x": "7"}

JSON format to return:
{
  "inferred_topic": "<the actual subject — e.g. linux, python, git, docker, kubernetes, ansible...>",
  "summary": "1-2 sentence plain-English summary of the entire solution",
  "difficulty": "beginner|intermediate|advanced",
  "estimated_time_minutes": 15,
  "steps": [
    {
      "id": "<uuid>",
      "type": "command|code|git|docker",
      "title": "Short imperative action label (e.g. 'Print Hello World')",
      "description": "One sentence explaining what this step does and why",
      "content": "Exact command / complete script — this is executed as-is",
      "output": "Expected output when this step runs (reference; actual output replaces this)",
      "example_inputs": {"variable_name": "example_value_string"},
      "question_ref": 1
    }
  ]
}"""


MISSING_QUESTIONS_SYSTEM = """You are completing missing parts of a structured lab solution.

Return ONLY a single valid JSON object with this shape:
{"steps": [<solution steps for the missing questions only>]}

Rules:
- Answer ONLY the missing questions provided in the prompt.
- Each returned step must be actionable and complete.
- Use the exact Q number shown in the prompt as question_ref.
- Do not reuse numbering from inside the question text.
- Use type "docker" for Docker commands, "git" for Git commands, "command" for shell commands, and "code" for Python scripts.
- For code steps, include complete runnable Python and example_inputs when input() is used.
- For project work items, return buildable file/setup/test/documentation steps, not a summary.
"""


# ── Prompt builder ───────────────────────────────────────────────────────────

def _build_prompt(
    category: str,
    title: str,
    content: str,
    questions_raw: str,
    subcategory: str = "",
    previous_error: str = "",
) -> str:
    questions = json.loads(questions_raw) if questions_raw else []

    q_lines = ""
    selected_questions = _selected_questions(questions)

    if selected_questions:
        lines = ["\n--- EXTRACTED QUESTIONS (answer every one) ---"]
        lines.append(
            "Use the Q number at the start of each item as question_ref. "
            "Do not use nested numbering inside a question body as question_ref."
        )
        if len(selected_questions) < len(questions):
            lines.append(
                "The source declares an optional choice. Answer only the required/selected Q items listed here."
            )
        for q in selected_questions:
            lines.append(f"Q{q.get('number', q.get('id', '?'))}: {q.get('full_text', q.get('text', ''))}")
        q_lines = "\n".join(lines)

    # Give the AI the declared category and subcategory as hints
    hint = f"Declared category: {category}, subcategory: {subcategory} (verify from content and set inferred_topic accordingly)"

    # Remind AI that Python code steps are verified by execution (labs/homework only)
    exec_note = ""
    if subcategory in ("labs", "homework"):
        exec_note = (
            "\nNOTE: Python 'code' steps will be executed in a sandbox. Write correct, runnable Python only."
            "\nIMPORTANT: Write EXPLICIT manual logic — no max(), min(), sort(), sorted(), sum() or other"
            " built-in shortcuts when the exercise tests algorithmic understanding. Use if/elif/else, loops, etc."
        )
    elif subcategory == "projects":
        exec_note = (
            "\nPROJECT MODE: produce a buildable reference implementation, not a short answer."
            "\nBreak the project into setup, source files, tests/demo commands, documentation, and submission artifacts."
            "\nFor multi-file projects, provide exact commands that create directories/files with heredocs, or code steps"
            " whose title clearly names the file path. Include requirements.txt, README/setup instructions, and any"
            " AI interaction log file when the source requires it."
            "\nProject code is not sandboxed automatically, so commands and expected outputs must be realistic and complete."
        )

    error_section = ""
    if previous_error:
        error_section = (
            f"\n\n--- PREVIOUS ATTEMPT FAILED — FIX THIS ---\n"
            f"{previous_error[:800]}\n"
            f"Analyse the error above and produce a corrected, complete solution. "
            f"Do not repeat the same mistake.\n"
        )

    content_limit = 12000 if subcategory == "projects" else 5000

    return f"""{hint}{exec_note}
Title: {title}

--- SOURCE CONTENT ---
{content[:content_limit]}
{q_lines}{error_section}
Return the JSON solution now. No markdown, no extra text."""


# ── Response validation ──────────────────────────────────────────────────────

def _make_validate(question_numbers: list[int], *, require_coverage: bool = False):
    """Return a validator for solver JSON shape and optional question coverage."""
    def _validate(data: dict) -> None:
        if "steps" not in data or not isinstance(data["steps"], list):
            raise ValueError("Response missing 'steps' array")
        if not data["steps"]:
            raise ValueError("Steps array is empty")
        if "summary" not in data:
            raise ValueError("Response missing 'summary'")
        if require_coverage and question_numbers:
            missing = _missing_question_refs(data["steps"], question_numbers)
            if missing:
                raise ValueError(_missing_questions_message(missing))
    return _validate


def _coerce_question_ref(value) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        if value.lower().startswith("q"):
            value = value[1:]
        if value.isdigit():
            return int(value)
    return None


def _normalise_question_refs(steps: list[dict]) -> None:
    for step in steps:
        ref = _coerce_question_ref(step.get("question_ref"))
        if ref is None:
            step.pop("question_ref", None)
        else:
            step["question_ref"] = ref


def _missing_question_refs(steps: list[dict], question_numbers: list[int]) -> list[int]:
    refs = {
        ref
        for step in steps
        if (ref := _coerce_question_ref(step.get("question_ref"))) is not None
    }
    return sorted(set(question_numbers) - refs)


def _missing_questions_message(missing: list[int]) -> str:
    return (
        f"Missing question_ref for question(s): {missing}. "
        f"Every extracted question must have at least one step."
    )


def _question_numbers(questions: list[dict]) -> list[int]:
    numbers: list[int] = []
    for q in _selected_questions(questions):
        raw = q.get("number", q.get("id"))
        ref = _coerce_question_ref(raw)
        if ref is not None:
            numbers.append(ref)
    return numbers


def _selected_questions(questions: list[dict]) -> list[dict]:
    return [
        q for q in questions
        if q.get("selected", q.get("required", True)) is not False
    ]


def _build_missing_questions_prompt(
    category: str,
    title: str,
    content: str,
    questions: list[dict],
    missing: list[int],
    existing_steps: list[dict],
    subcategory: str = "",
) -> str:
    question_by_number = {
        _coerce_question_ref(q.get("number", q.get("id"))): q
        for q in _selected_questions(questions)
    }
    missing_lines = []
    for number in missing:
        q = question_by_number.get(number) or {}
        missing_lines.append(f"Q{number}: {q.get('full_text', q.get('text', ''))}")

    compact_steps = [
        {
            "type": s.get("type"),
            "title": s.get("title"),
            "content": s.get("content"),
            "question_ref": s.get("question_ref"),
        }
        for s in existing_steps
    ]
    content_limit = 8000 if subcategory == "projects" else 3500

    return f"""Declared category: {category}, subcategory: {subcategory}
Title: {title}

--- SOURCE CONTENT (context) ---
{content[:content_limit]}

--- MISSING QUESTIONS TO COMPLETE ---
{chr(10).join(missing_lines)}

--- EXISTING SOLUTION STEPS (do not duplicate) ---
{json.dumps(compact_steps, ensure_ascii=False)[:3500]}

Return JSON now with steps for the missing questions only."""


def _make_missing_validate(missing: list[int]):
    def _validate(data: dict) -> None:
        if "steps" not in data or not isinstance(data["steps"], list):
            raise ValueError("Response missing 'steps' array")
        if not data["steps"]:
            raise ValueError("Steps array is empty")
        _normalise_question_refs(data["steps"])
        still_missing = _missing_question_refs(data["steps"], missing)
        if still_missing:
            raise ValueError(_missing_questions_message(still_missing))
    return _validate


async def _complete_missing_questions(
    client,
    category: str,
    title: str,
    content: str,
    questions: list[dict],
    missing: list[int],
    existing_steps: list[dict],
    subcategory: str = "",
) -> list[dict]:
    prompt = _build_missing_questions_prompt(
        category=category,
        title=title,
        content=content,
        questions=questions,
        missing=missing,
        existing_steps=existing_steps,
        subcategory=subcategory,
    )
    data = await asyncio.to_thread(
        call_with_retries,
        client=client,
        system_instruction=MISSING_QUESTIONS_SYSTEM,
        prompt=prompt,
        temperature=0.1,
        validate_fn=_make_missing_validate(missing),
    )
    normalise_steps(data["steps"])
    _normalise_question_refs(data["steps"])
    return data["steps"]


# ── Public API ───────────────────────────────────────────────────────────────

async def solve_lab(
    category: str,
    content: str,
    questions_raw: str,
    title: str,
    subcategory: str = "",
    previous_error: str = "",
) -> tuple[str, list[SolutionStep], str, str, str]:
    """Generate a solution using the best available AI provider.

    Returns (summary, steps, inferred_topic, ai_model_label, prompt_used).
    Raises RuntimeError if all retries fail.
    """
    client = get_solve_client()
    if not client:
        raise RuntimeError(
            "No AI provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY in your .env file."
        )

    prompt = _build_prompt(category, title, content, questions_raw, subcategory, previous_error)

    # Validate JSON shape first; missing question coverage is repaired below.
    questions = json.loads(questions_raw) if questions_raw else []
    q_numbers = _question_numbers(questions)
    validate_fn = _make_validate(q_numbers)

    data = await asyncio.to_thread(
        call_with_retries,
        client=client,
        system_instruction=SYSTEM_INSTRUCTION,
        prompt=prompt,
        validate_fn=validate_fn,
    )

    normalise_steps(data["steps"])
    _normalise_question_refs(data["steps"])

    if q_numbers:
        missing = _missing_question_refs(data["steps"], q_numbers)
        if missing:
            print(f"[solver] Completing missing question_ref coverage: {missing}")
            completion_steps = await _complete_missing_questions(
                client=client,
                category=category,
                title=title,
                content=content,
                questions=questions,
                missing=missing,
                existing_steps=data["steps"],
                subcategory=subcategory,
            )
            data["steps"].extend(completion_steps)
            normalise_steps(data["steps"])
            _normalise_question_refs(data["steps"])
            missing = _missing_question_refs(data["steps"], q_numbers)
            if missing:
                raise RuntimeError(_missing_questions_message(missing))

    steps = [
        SolutionStep(
            id=s["id"],
            type=s["type"],
            title=s["title"],
            description=s.get("description"),
            content=s["content"],
            output=s.get("output") or s.get("expected_output"),
            example_inputs=s.get("example_inputs") or None,
            status="pending",
            question_ref=int(s["question_ref"]) if s.get("question_ref") is not None else None,
        )
        for s in data["steps"]
    ]

    inferred_topic = data.get("inferred_topic", category).lower().strip() or category
    return data["summary"], steps, inferred_topic, get_solve_provider_label(), prompt
