"""Safe command and code executor with output capture."""
import asyncio
import sys
import tempfile
from pathlib import Path
from typing import Optional

SAFE_PREFIXES = (
    "ls", "pwd", "whoami", "hostname", "uname", "cat", "head", "tail",
    "echo", "mkdir", "touch", "cp", "mv", "wc", "sort", "find", "grep",
    "git ", "python3", "python ", "printenv", "env", "which", "man ",
)

BLOCKED_PATTERNS = (
    "rm -rf /", ":(){ :|:& };:", "dd if=/dev/zero", "> /dev/sda",
    "chmod 000 /", "mkfs", "fdisk", "format", "shutdown", "reboot",
    "halt", "poweroff", "init 0",
)


def is_safe_command(cmd: str) -> bool:
    cmd_lower = cmd.strip().lower()
    for blocked in BLOCKED_PATTERNS:
        if blocked in cmd_lower:
            return False
    return True


async def execute_command(command: str, cwd: Optional[str] = None, timeout: int = 10) -> tuple[str, str, int]:
    """Run a shell command. Returns (stdout, stderr, returncode)."""
    if not is_safe_command(command):
        return "", "Command blocked for safety", 1

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace"), proc.returncode
    except asyncio.TimeoutError:
        return "", f"Command timed out after {timeout}s", 1
    except Exception as e:
        return "", str(e), 1


async def execute_python(code: str, timeout: int = 15) -> tuple[str, str, int]:
    """Execute Python code in a temp file. Returns (stdout, stderr, returncode)."""
    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
        f.write(code)
        tmp_path = f.name

    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, tmp_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return (
            stdout.decode("utf-8", errors="replace"),
            stderr.decode("utf-8", errors="replace"),
            proc.returncode,
        )
    except asyncio.TimeoutError:
        return "", f"Execution timed out after {timeout}s", 1
    except Exception as e:
        return "", str(e), 1
    finally:
        Path(tmp_path).unlink(missing_ok=True)


async def run_step(step_type: str, content: str) -> tuple[str, str, int]:
    """Execute a solution step based on its type."""
    if step_type == "code":
        return await execute_python(content)
    elif step_type in ("command", "git"):
        return await execute_command(content)
    else:
        return content, "", 0
