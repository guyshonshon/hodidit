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

Your task: analyze the given lab or homework content and produce a complete, executable solution.
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
9. Keep steps granular — one command or one code block per step, one step per question.
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
    if questions:
        lines = ["\n--- EXTRACTED QUESTIONS (answer every one) ---"]
        for q in questions[:40]:
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

    error_section = ""
    if previous_error:
        error_section = (
            f"\n\n--- PREVIOUS ATTEMPT FAILED — FIX THIS ---\n"
            f"{previous_error[:800]}\n"
            f"Analyse the error above and produce a corrected, complete solution. "
            f"Do not repeat the same mistake.\n"
        )

    return f"""{hint}{exec_note}
Title: {title}

--- LAB / HOMEWORK CONTENT ---
{content[:5000]}
{q_lines}{error_section}
Return the JSON solution now. No markdown, no extra text."""


# ── Response validation ──────────────────────────────────────────────────────

def _validate(data: dict) -> None:
    if "steps" not in data or not isinstance(data["steps"], list):
        raise ValueError("Response missing 'steps' array")
    if not data["steps"]:
        raise ValueError("Steps array is empty")
    if "summary" not in data:
        raise ValueError("Response missing 'summary'")


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

    data = await asyncio.to_thread(
        call_with_retries,
        client=client,
        system_instruction=SYSTEM_INSTRUCTION,
        prompt=prompt,
        validate_fn=_validate,
    )

    normalise_steps(data["steps"])

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

