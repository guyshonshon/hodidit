"""Unified AI provider abstraction — Gemini and OpenAI with explicit selection.

Provider selection:
  - AI_PROVIDER=auto   -> OpenAI if OPENAI_API_KEY exists, else Gemini
  - AI_PROVIDER=openai -> force OpenAI
  - AI_PROVIDER=gemini -> force Gemini

Both providers return parsed dict from JSON-mode responses.
"""
import json
import re
import time
import uuid
from typing import Optional

from .config import settings

MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 2

# Cheapest OpenAI model used as a rate-limit fallback for lightweight tasks (classification).
# Never used for solution generation.
CLASSIFY_FALLBACK_MODEL = "gpt-4o-mini"


def _is_rate_limit(exc: Exception) -> bool:
    """True when the error is an API quota / rate-limit (HTTP 429)."""
    msg = str(exc).lower()
    return "429" in msg or "quota exceeded" in msg or "rate limit" in msg


# ── JSON cleaning shared by both providers ──────────────────────────────────

def _extract_json_object(raw: str) -> str | None:
    """Return the first balanced JSON object embedded in raw text, if present."""
    start = raw.find("{")
    if start < 0:
        return None

    depth = 0
    in_string = False
    escaped = False
    for idx in range(start, len(raw)):
        ch = raw[idx]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return raw[start:idx + 1]
    return None


def _clean_json(raw: str) -> dict:
    if not raw or not raw.strip():
        raise ValueError("AI returned an empty response")
    raw = raw.strip()
    # Strip markdown code fences
    raw = re.sub(r"^```(?:json)?\s*\n?", "", raw, flags=re.MULTILINE)
    raw = re.sub(r"\n?```\s*$", "", raw, flags=re.MULTILINE)
    raw = raw.strip()
    if not raw:
        raise ValueError("AI returned an empty response after stripping markdown")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        embedded = _extract_json_object(raw)
        if embedded and embedded != raw:
            try:
                return json.loads(embedded)
            except json.JSONDecodeError:
                pass
        # Gemini sometimes returns Python dict notation (single quotes, True/False/None).
        # ast.literal_eval handles that safely without executing arbitrary code.
        import ast
        try:
            result = ast.literal_eval(raw)
            if isinstance(result, dict):
                return result
        except (ValueError, SyntaxError):
            pass
        raise  # re-raise original JSONDecodeError


# ── Providers ───────────────────────────────────────────────────────────────

class GeminiClient:
    """Wraps google-generativeai in JSON mode."""

    def __init__(self, api_key: str, model: str):
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self._genai = genai
        self.model_name = model
        self.provider = "gemini"

    def generate_json(
        self,
        system_instruction: str,
        prompt: str,
        temperature: float = 0.15,
        max_tokens: int = 8192,
    ) -> dict:
        model = self._genai.GenerativeModel(
            model_name=self.model_name,
            system_instruction=system_instruction,
            generation_config={
                "temperature": temperature,
                "max_output_tokens": max_tokens,
                "response_mime_type": "application/json",
            },
        )
        response = model.generate_content(prompt)
        text = response.text if response.text is not None else ""
        return _clean_json(text)


class OpenAIClient:
    """Wraps openai SDK in JSON mode."""

    def __init__(self, api_key: str, model: str):
        from openai import OpenAI
        self._client = OpenAI(api_key=api_key)
        self.model_name = model
        self.provider = "openai"

    def generate_json(
        self,
        system_instruction: str,
        prompt: str,
        temperature: float = 0.15,
        max_tokens: int = 8192,
    ) -> dict:
        response = self._client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        return _clean_json(response.choices[0].message.content)


# ── Factory ─────────────────────────────────────────────────────────────────

def get_ai_client() -> Optional["GeminiClient | OpenAIClient"]:
    """Return an AI client according to AI_PROVIDER and configured keys."""
    provider = (settings.ai_provider or "auto").strip().lower()

    if provider == "openai":
        return OpenAIClient(settings.openai_api_key, settings.openai_model) if settings.openai_api_key else None
    if provider == "gemini":
        return GeminiClient(settings.gemini_api_key, settings.gemini_model) if settings.gemini_api_key else None

    # auto (default): OpenAI first, then Gemini
    if settings.openai_api_key:
        return OpenAIClient(settings.openai_api_key, settings.openai_model)
    if settings.gemini_api_key:
        return GeminiClient(settings.gemini_api_key, settings.gemini_model)
    return None


def get_classify_client() -> Optional["GeminiClient | OpenAIClient"]:
    """Client for classification — Gemini preferred (free tier), fallback to OpenAI."""
    if settings.gemini_api_key:
        return GeminiClient(settings.gemini_api_key, settings.gemini_model)
    if settings.openai_api_key:
        return OpenAIClient(settings.openai_api_key, settings.openai_model)
    return None


def get_classify_fallback_client() -> Optional["OpenAIClient"]:
    """Cheapest OpenAI model used when Gemini classification hits a rate limit.
    Only for lightweight tasks — never for solution generation.
    """
    if settings.openai_api_key:
        return OpenAIClient(settings.openai_api_key, CLASSIFY_FALLBACK_MODEL)
    return None


def get_solve_client() -> Optional["GeminiClient | OpenAIClient"]:
    """Client for solving — OpenAI preferred (quality), fallback to Gemini."""
    if settings.openai_api_key:
        return OpenAIClient(settings.openai_api_key, settings.openai_model)
    if settings.gemini_api_key:
        return GeminiClient(settings.gemini_api_key, settings.gemini_model)
    return None


def get_provider_label() -> str:
    """Human-readable label for the active provider (used in Solution.ai_model)."""
    provider = (settings.ai_provider or "auto").strip().lower()

    if provider == "openai":
        return f"openai/{settings.openai_model}" if settings.openai_api_key else "demo"
    if provider == "gemini":
        return f"gemini/{settings.gemini_model}" if settings.gemini_api_key else "demo"

    if settings.openai_api_key:
        return f"openai/{settings.openai_model}"
    if settings.gemini_api_key:
        return f"gemini/{settings.gemini_model}"
    return "demo"


def get_solve_provider_label() -> str:
    """Label for the solve provider (OpenAI preferred)."""
    if settings.openai_api_key:
        return f"openai/{settings.openai_model}"
    if settings.gemini_api_key:
        return f"gemini/{settings.gemini_model}"
    return "demo"


# ── Retry wrapper ────────────────────────────────────────────────────────────

def call_with_retries(
    client: "GeminiClient | OpenAIClient",
    system_instruction: str,
    prompt: str,
    temperature: float = 0.15,
    max_tokens: int = 8192,
    validate_fn=None,
    fallback_client: Optional["GeminiClient | OpenAIClient"] = None,
) -> dict:
    """Call generate_json with error-aware retries.

    On parse/validation failure the error is appended to the prompt so the AI
    can inspect and self-correct on the next attempt.

    If fallback_client is provided and the primary client returns a rate-limit
    error (429), the remaining attempts switch to the fallback client.
    validate_fn(data) -> None  (raises ValueError if data is invalid)
    """
    last_error: Optional[Exception] = None
    current_prompt = prompt
    active_client = client

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            data = active_client.generate_json(system_instruction, current_prompt, temperature, max_tokens)
            if validate_fn:
                validate_fn(data)
            return data

        except (json.JSONDecodeError, ValueError, KeyError) as exc:
            last_error = exc
            print(f"[ai_client] Attempt {attempt}/{MAX_RETRIES} parse/validation error: {exc}")
            if attempt < MAX_RETRIES:
                # For Gemini in JSON mode the retry should stay minimal — appending free-text
                # instructions to the prompt can cause it to return empty. Just re-use the
                # original prompt; Gemini will re-sample with a different seed.
                if hasattr(active_client, "provider") and active_client.provider == "gemini":
                    current_prompt = prompt  # pure retry — let Gemini re-sample
                else:
                    # OpenAI handles free-text error feedback well
                    current_prompt = (
                        f"{prompt}\n\n"
                        f"--- PREVIOUS ATTEMPT FAILED (attempt {attempt}) ---\n"
                        f"Error: {exc}\n"
                        f"Fix the issue and return valid JSON only. No markdown, no extra text."
                    )
                time.sleep(RETRY_DELAY_SECONDS * attempt)

        except Exception as exc:
            last_error = exc
            print(f"[ai_client] Attempt {attempt}/{MAX_RETRIES} API error: {exc}")
            if attempt < MAX_RETRIES:
                # Rate-limit on primary → switch to fallback for remaining attempts
                if (
                    fallback_client is not None
                    and active_client is not fallback_client
                    and _is_rate_limit(exc)
                ):
                    print(
                        f"[ai_client] Rate limit on {getattr(active_client, 'provider', '?')} "
                        f"({getattr(active_client, 'model_name', '?')}), "
                        f"switching to fallback {getattr(fallback_client, 'provider', '?')} "
                        f"({getattr(fallback_client, 'model_name', '?')})"
                    )
                    active_client = fallback_client
                    current_prompt = prompt  # reset prompt for the new client
                else:
                    time.sleep(RETRY_DELAY_SECONDS * attempt)

    raise RuntimeError(f"AI call failed after {MAX_RETRIES} attempts: {last_error}")


# ── Step ID normalisation (shared utility) ───────────────────────────────────

VALID_STEP_TYPES = {"explanation", "command", "code", "git", "docker", "output"}


def normalise_steps(steps: list[dict]) -> list[dict]:
    """Ensure every step has a UUID and a valid type."""
    for step in steps:
        if not step.get("id"):
            step["id"] = str(uuid.uuid4())
        if step.get("type") not in VALID_STEP_TYPES:
            step["type"] = "explanation"
    return steps
