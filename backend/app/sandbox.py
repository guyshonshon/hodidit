"""Python-only sandbox for verifying code steps.

Only 'code' steps (Python scripts) are executed — command/git/docker/etc.
keep their AI-generated output and are always marked success.

The sandbox runs each Python script in a temporary directory, captures
real stdout/stderr, and marks the step success (exit 0) or error (non-zero).
Failed Python steps feed into the AI repair loop.
"""
import asyncio
import os
import tempfile
from typing import Optional

from .models import SolutionStep

# ── Config ────────────────────────────────────────────────────────────────────

STEP_TIMEOUT = 30          # seconds per step before SIGKILL
SANDBOX_PREFIX = "devops_sandbox_"

# Only 'code' steps are executed; everything else keeps AI output
EXECUTABLE_TYPES = frozenset({"code"})


# ── Low-level runner ──────────────────────────────────────────────────────────

async def _run_python(fname: str, workdir: str, stdin_data: bytes = b"") -> dict:
    """Run a Python file, return {stdout, stderr, exit_code, success}."""
    try:
        stdin_mode = asyncio.subprocess.PIPE if stdin_data else asyncio.subprocess.DEVNULL
        proc = await asyncio.create_subprocess_exec(
            "python3", fname,
            cwd=workdir,
            stdin=stdin_mode,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(input=stdin_data if stdin_data else None),
                timeout=STEP_TIMEOUT,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return {
                "stdout": "",
                "stderr": f"Script timed out after {STEP_TIMEOUT}s",
                "exit_code": 124,
                "success": False,
            }
        return {
            "stdout": stdout.decode("utf-8", errors="replace"),
            "stderr": stderr.decode("utf-8", errors="replace"),
            "exit_code": proc.returncode,
            "success": proc.returncode == 0,
        }
    except FileNotFoundError:
        return {"stdout": "", "stderr": "python3 not found", "exit_code": 127, "success": False}
    except Exception as exc:
        return {"stdout": "", "stderr": str(exc), "exit_code": 1, "success": False}


# ── Per-step executor ─────────────────────────────────────────────────────────

async def execute_step(step: SolutionStep, workdir: str, idx: int) -> dict:
    """Execute a code step. Non-code steps are skipped (AI output kept)."""
    if step.type not in EXECUTABLE_TYPES:
        return {"stdout": step.output or "", "stderr": "", "exit_code": 0, "success": True, "skipped": True}

    content = (step.content or "").strip()
    if not content:
        return {"stdout": "", "stderr": "", "exit_code": 0, "success": True, "skipped": True}

    fname = os.path.join(workdir, f"step_{idx}.py")
    script = _build_script_with_input_echo(content, step.example_inputs)
    with open(fname, "w") as f:
        f.write(script)

    return await _run_python(fname, workdir)


def _build_script_with_input_echo(content: str, example_inputs: Optional[dict]) -> str:
    """Prepend an input() override that echoes each supplied value to stdout.

    This simulates real terminal behaviour where typed input is echoed back,
    so the captured output looks like:
        Enter a string: HelloWorld
        The input contains only letters.
    instead of:
        Enter a string: The input contains only letters.
    """
    if not example_inputs:
        return content
    values = [str(v) for v in example_inputs.values()]
    preamble = (
        "import sys as _sys\n"
        f"_input_values = iter({values!r})\n"
        "def input(prompt=''):\n"
        "    _sys.stdout.write(str(prompt))\n"
        "    val = next(_input_values)\n"
        "    _sys.stdout.write(str(val) + '\\n')\n"
        "    _sys.stdout.flush()\n"
        "    return str(val)\n\n"
    )
    return preamble + content


# ── Batch executor ────────────────────────────────────────────────────────────

async def run_steps_in_sandbox(steps: list[SolutionStep]) -> list[dict]:
    """Execute all code steps sequentially in a shared temp dir.

    Non-code steps are skipped. Returns one result dict per step in order.
    Continues on failure so all errors are captured in a single pass.
    """
    results = []
    with tempfile.TemporaryDirectory(prefix=SANDBOX_PREFIX) as workdir:
        for idx, step in enumerate(steps):
            result = await execute_step(step, workdir, idx)
            results.append(result)
    return results


# ── Result application ────────────────────────────────────────────────────────

def apply_results(steps: list[SolutionStep], results: list[dict]) -> None:
    """Update step .status and .output in-place from sandbox results."""
    for step, result in zip(steps, results):
        if result.get("skipped"):
            step.status = "success"
            # Keep AI-generated output for non-code steps
            continue

        step.status = "success" if result["success"] else "error"
        stdout = result["stdout"].strip()
        stderr = result["stderr"].strip()

        if result["success"]:
            step.output = stdout if stdout else "(no output)"
        else:
            parts = []
            if stdout:
                parts.append(stdout)
            if stderr:
                parts.append(f"[stderr] {stderr}")
            step.output = "\n".join(parts) if parts else f"Exit code {result['exit_code']}"


# ── Error collection for repair loop ─────────────────────────────────────────

def collect_sandbox_errors(steps: list[SolutionStep], results: list[dict]) -> Optional[str]:
    """Return formatted error string for the repair loop, or None if all code steps passed."""
    errors = []
    for step, result in zip(steps, results):
        if result.get("skipped") or result["success"]:
            continue
        errors.append(
            f"Step '{step.title}' [code] FAILED (exit {result['exit_code']}):\n"
            f"  Script:\n    {step.content[:500]}\n"
            f"  Stdout: {result['stdout'][:400] or '(none)'}\n"
            f"  Stderr: {result['stderr'][:400] or '(none)'}"
        )
    return "\n\n".join(errors) if errors else None
