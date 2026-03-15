"""Lab routes — cache-first solve pipeline.

Caching contract
────────────────
Once Solution.steps_json is populated it is ALWAYS returned as-is.
The AI is never called again for the same lab unless force=True is passed.

Data separation contract
────────────────────────
Solution.steps_json   → final clean educational content (only thing shown to users)
Solution.internal_log → JSON array of AttemptLog dicts (NEVER in any API response)

Execution policy
────────────────
After AI generates steps, the sandbox actually executes command/code/git steps.
Real stdout/stderr replaces AI-guessed output. Failed steps trigger the repair loop
(up to max_repair_retries). docker/kubernetes/ansible steps are skipped (not sandboxed).
"""
import asyncio
import json
import time
from datetime import datetime, timezone, timedelta

_TZ = timezone(timedelta(hours=2))  # GMT+2

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from ..classifier import ExerciseType, classify_exercise
from ..config import settings
from ..database import get_session
from ..models import Lab, Solution, SolutionStep, SolveRequest
from ..repairer import AttemptLog, repair_solution, serialize_logs
from ..sandbox import apply_results, collect_sandbox_errors, run_steps_in_sandbox
from ..scraper import discover_labs, fetch_generated_content
from ..solver import solve_lab
from ..git_handler import push_solution_to_github

router = APIRouter(prefix="/labs", tags=["labs"])


# ── List / Get ─────────────────────────────────────────────────────────────────

@router.get("/")
async def list_labs(session: Session = Depends(get_session)):
    labs = session.exec(select(Lab)).all()
    result = []
    for lab in labs:
        sol = session.exec(
            select(Solution).where(Solution.lab_slug == lab.slug)
        ).first()
        has_steps = bool(sol and sol.steps_json and sol.steps_json != "[]")
        result.append({
            "slug": lab.slug,
            "title": lab.title,
            "page_title": lab.page_title,
            "category": lab.category,
            "subcategory": lab.subcategory,
            "url": lab.url,
            "is_dynamic": lab.is_dynamic,
            "ai_topic": lab.ai_topic,
            "solved": has_steps,
            "solution_status": _solution_status(sol, has_steps),
            "summary": (sol.summary or "") if sol else "",
            "solve_log": (sol.solve_log or "") if sol else "",
            "discovered_at": lab.discovered_at.isoformat(),
            "last_scraped": lab.last_scraped.isoformat() if lab.last_scraped else None,
        })
    return result


@router.get("/{slug}")
async def get_lab(slug: str, session: Session = Depends(get_session)):
    lab = session.exec(select(Lab).where(Lab.slug == slug)).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")
    sol = session.exec(select(Solution).where(Solution.lab_slug == slug)).first()
    has_steps = bool(sol and sol.steps_json and sol.steps_json != "[]")
    return {
        "slug": lab.slug,
        "title": lab.title,
        "page_title": lab.page_title,
        "category": lab.category,
        "subcategory": lab.subcategory,
        "url": lab.url,
        "is_dynamic": lab.is_dynamic,
        "ai_topic": lab.ai_topic,
        "content": lab.content,
        "questions": json.loads(lab.questions_raw) if lab.questions_raw else [],
        "solution": _format_solution(sol) if sol else None,
        "solution_status": _solution_status(sol, has_steps),
    }


# ── Solve (cache-first) ────────────────────────────────────────────────────────

@router.post("/{slug}/solve")
async def solve(slug: str, req: SolveRequest, session: Session = Depends(get_session)):
    lab = session.exec(select(Lab).where(Lab.slug == slug)).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")

    existing = session.exec(select(Solution).where(Solution.lab_slug == slug)).first()
    has_steps = bool(existing and existing.steps_json and existing.steps_json != "[]")

    # Cache-first: replay stored steps unless explicitly forced
    if has_steps and not req.force:
        return {"message": "Replaying stored solution", "solution": _format_solution(existing)}

    result = await _do_solve_pipeline(lab, session, existing, force=req.force)
    return {"message": "Solved", "solution": result}


# ── Core pipeline (shared between HTTP endpoint and startup auto-solve) ─────────

async def _do_solve_pipeline(
    lab: Lab,
    session: Session,
    existing_solution: Solution | None = None,
    force: bool = False,
    previous_error: str = "",
) -> dict:
    """Run the classify → solve pipeline for a lab. Returns formatted solution dict.

    Commands are NEVER executed on the host — AI-generated output is used as-is.
    Raises HTTPException on unrecoverable errors (for HTTP callers).
    For background callers, catch Exception instead.
    """
    solution = existing_solution or Solution(lab_slug=lab.slug)
    solution.status = "solving"
    solution.solve_log = ""
    session.add(solution)
    session.commit()
    session.refresh(solution)

    attempt_logs: list[AttemptLog] = []

    def _log(msg: str) -> None:
        """Append a timestamped line to solve_log and flush to DB."""
        ts = datetime.now(_TZ).strftime("%H:%M:%S")
        solution.solve_log = (solution.solve_log or "") + f"[{ts}] {msg}\n"
        session.add(solution)
        session.commit()

    try:
        # Step 1: Classify
        _log("Classifying exercise…")
        exercise_type, class_reason = await classify_exercise(
            content=lab.content,
            questions_raw=lab.questions_raw,
            title=lab.title,
            category=lab.category,
            subcategory=lab.subcategory or "",
        )
        solution.exercise_classification = exercise_type.value
        solution.classification_reason = class_reason
        _log(f"Classification: {exercise_type.value} — {class_reason[:80]}")

        # Step 2: Dynamic generation (if needed)
        content_to_solve = lab.content
        questions_to_solve = lab.questions_raw

        if exercise_type == ExerciseType.requires_generation:
            _log("Fetching dynamically generated content…")
            generated = await fetch_generated_content(lab.url)

            if generated is None:
                _log("Dynamic generation failed — falling back to original scraped content")
                solution.solve_status_detail = "generation_failed_fallback"
                session.add(solution)
                session.commit()
            else:
                _log("Dynamic content fetched successfully")
                content_to_solve = generated
                solution.content_was_generated = True
                from ..scraper import extract_questions
                questions_to_solve = json.dumps(extract_questions(generated, lab.url))
                session.add(solution)
                session.commit()

        elif exercise_type == ExerciseType.ambiguous_manual_review:
            _log(f"ERROR: Ambiguous exercise — skipping auto-solve")
            solution.solve_status_detail = "ambiguous_manual_review"
            solution.internal_log = serialize_logs([
                AttemptLog(attempt=1, was_repair=False,
                           error=f"Ambiguous — auto-solve skipped. Reason: {class_reason}")
            ])
            session.add(solution)
            session.commit()
            raise HTTPException(status_code=422,
                                detail=f"Exercise is ambiguous: {class_reason}")

        # Step 3: Solve with AI
        _log("Sending to AI solver…")
        summary, steps, inferred_topic, ai_model_label, prompt_used = await solve_lab(
            category=lab.category,
            content=content_to_solve,
            questions_raw=questions_to_solve,
            title=lab.title,
            subcategory=lab.subcategory or "",
            previous_error=previous_error,
        )
        _log(f"AI response received — {len(steps)} step(s) via {ai_model_label}")

        # Persist inferred topic back on the lab record
        if inferred_topic and inferred_topic != lab.ai_topic:
            lab.ai_topic = inferred_topic
            session.add(lab)

        # Step 4: Verify Python code steps in sandbox + repair loop
        #         Only for labs/homework that actually contain 'code' steps.
        #         Lessons and labs with no Python code skip the sandbox entirely.
        max_retries = settings.max_repair_retries
        repair_count = 0
        solve_status_detail = "resolved"
        error = None

        has_code_steps = any(s.type == "code" for s in steps)
        sandbox_eligible = lab.subcategory in ("labs", "homework") and has_code_steps

        if sandbox_eligible:
            code_count = sum(1 for s in steps if s.type == "code")
            _log(f"Verifying {code_count} Python step(s) in sandbox…")
            results = await run_steps_in_sandbox(steps)
            apply_results(steps, results)

            error = collect_sandbox_errors(steps, results)
            if error:
                failed_n = sum(1 for r in results if not r.get('skipped') and not r['success'])
                _log(f"Sandbox: {failed_n} Python step(s) failed — starting repair loop")

            while error and repair_count < max_retries:
                repair_count += 1
                _log(f"Repair attempt {repair_count}/{max_retries}…")
                attempt_logs.append(AttemptLog(
                    attempt=repair_count, was_repair=True, error=error,
                    steps_snapshot=json.dumps([s.model_dump() for s in steps]),
                ))

                summary, steps = await repair_solution(
                    category=lab.category,
                    content=content_to_solve,
                    questions_raw=questions_to_solve,
                    failed_steps=steps,
                    error_message=error,
                )

                _log(f"Re-running Python steps after repair {repair_count}…")
                results = await run_steps_in_sandbox(steps)
                apply_results(steps, results)
                error = collect_sandbox_errors(steps, results)

                if error:
                    failed_n = sum(1 for r in results if not r.get('skipped') and not r['success'])
                    _log(f"Repair {repair_count}: {failed_n} step(s) still failing")
                else:
                    _log(f"Repair {repair_count}: all Python steps passed ✓")
        elif lab.subcategory == "lessons":
            _log("Lessons — using AI output as-is (no sandbox)")
        else:
            _log("No Python code steps — using AI output as-is")

        if error:
            solve_status_detail = "unresolved"
            _log(f"Max retries reached — saving best effort solution")
        elif repair_count > 0:
            solve_status_detail = "repaired"
        else:
            solve_status_detail = "resolved"

        # Step 5: Persist — clean steps (with real output), internal log separate
        _log("Persisting solution…")
        solution.status = "solved"
        solution.summary = summary
        solution.steps_json = json.dumps([s.model_dump() for s in steps])
        solution.solved_at = datetime.utcnow()
        solution.ai_model = ai_model_label
        solution.repair_count = repair_count
        solution.solve_status_detail = solve_status_detail
        solution.internal_log = serialize_logs(attempt_logs)
        solution.prompt_used = prompt_used
        _log("Done ✓")

        session.add(solution)
        session.commit()
        session.refresh(solution)

        return _format_solution(solution)

    except HTTPException:
        raise
    except Exception as exc:
        _log(f"ERROR: {exc}")
        attempt_logs.append(AttemptLog(
            attempt=len(attempt_logs) + 1, was_repair=False, error=str(exc)
        ))
        solution.status = "solving"   # leave retryable, not a terminal "failed"
        solution.summary = str(exc)
        solution.internal_log = serialize_logs(attempt_logs)
        session.add(solution)
        session.commit()
        raise HTTPException(status_code=500, detail=str(exc))


# ── Replay / GitHub / Sync ─────────────────────────────────────────────────────

@router.post("/{slug}/replay")
async def get_replay(slug: str, session: Session = Depends(get_session)):
    """Return stored steps for animation replay."""
    sol = session.exec(select(Solution).where(Solution.lab_slug == slug)).first()
    if not sol or not sol.steps_json or sol.steps_json == "[]":
        raise HTTPException(status_code=404, detail="No solution stored yet")
    return _format_solution(sol)


@router.post("/{slug}/push-github")
async def push_to_github(slug: str, session: Session = Depends(get_session)):
    sol = session.exec(select(Solution).where(Solution.lab_slug == slug)).first()
    if not sol or not sol.steps_json or sol.steps_json == "[]":
        raise HTTPException(status_code=400, detail="Lab must be solved first")
    result = push_solution_to_github(slug, json.loads(sol.steps_json), sol.summary)
    return result


@router.post("/admin/re-solve-all")
async def re_solve_all(session: Session = Depends(get_session)):
    """Clear all stored solutions and queue a full re-solve in the background."""
    solutions = session.exec(select(Solution)).all()
    slugs = [sol.lab_slug for sol in solutions]
    for sol in solutions:
        sol.steps_json = "[]"
        sol.status = "unsolved"
        sol.summary = ""
        sol.solved_at = None
        sol.ai_model = ""
        sol.repair_count = 0
        sol.solve_status_detail = ""
        sol.prompt_used = ""
        sol.internal_log = "[]"
        session.add(sol)
    session.commit()
    asyncio.create_task(_batch_resolve(slugs))
    return {"cleared": len(slugs), "queued": len(slugs)}


async def _batch_resolve(slugs: list[str]) -> None:
    """Re-solve a list of lab slugs sequentially in the background."""
    from ..database import engine as _engine
    MAX_RETRIES = 3
    for slug in slugs:
        last_error = ""
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                with Session(_engine) as session:
                    lab = session.exec(select(Lab).where(Lab.slug == slug)).first()
                    if not lab:
                        break
                    existing = session.exec(select(Solution).where(Solution.lab_slug == slug)).first()
                    await _do_solve_pipeline(lab, session, existing, force=True, previous_error=last_error)
                print(f"[re-solve] ✓ {slug}")
                break
            except Exception as exc:
                last_error = str(exc)
                print(f"[re-solve] ✗ {slug} attempt {attempt}/{MAX_RETRIES}: {exc}")
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(5 * attempt)
        await asyncio.sleep(1)


# ── Sync rate limiter (in-memory, per IP) ──────────────────────────────────────

_MAX_FAILURES   = 5     # wrong PINs before lockout
_LOCKOUT_SECS   = 300   # 5-minute lockout after _MAX_FAILURES wrong PINs
_COOLDOWN_SECS  = 30    # minimum gap between successful syncs (any IP)

# ip → {"failures": int, "locked_until": float, "last_success": float}
_sync_state: dict[str, dict] = {}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host or "unknown")


def _check_sync_rate(ip: str, pin_required: bool) -> None:
    state = _sync_state.setdefault(ip, {"failures": 0, "locked_until": 0.0, "last_success": 0.0})
    now = time.monotonic()

    # Brute-force lockout (only applies when a PIN is required)
    if pin_required and state["locked_until"] > now:
        secs = int(state["locked_until"] - now) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts — locked out for {secs}s",
            headers={"Retry-After": str(secs)},
        )

    # Success cooldown (applies regardless of PIN)
    if state["last_success"] > 0 and (now - state["last_success"]) < _COOLDOWN_SECS:
        secs = int(_COOLDOWN_SECS - (now - state["last_success"])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Sync cooldown — try again in {secs}s",
            headers={"Retry-After": str(secs)},
        )


def _record_failure(ip: str) -> None:
    state = _sync_state.setdefault(ip, {"failures": 0, "locked_until": 0.0, "last_success": 0.0})
    state["failures"] += 1
    if state["failures"] >= _MAX_FAILURES:
        state["locked_until"] = time.monotonic() + _LOCKOUT_SECS
        state["failures"] = 0  # reset counter so it's clean after lockout expires


def _record_success(ip: str) -> None:
    state = _sync_state.setdefault(ip, {"failures": 0, "locked_until": 0.0, "last_success": 0.0})
    state["failures"] = 0
    state["last_success"] = time.monotonic()


# ── Sync endpoint ───────────────────────────────────────────────────────────────

class SyncRequest(BaseModel):
    pin: str = ""


@router.post("/sync")
async def sync_labs(request: Request, body: SyncRequest = SyncRequest(), session: Session = Depends(get_session)):
    """Trigger manual re-scrape of the target site. PIN + rate-limit protected."""
    ip = _client_ip(request)
    pin_required = bool(settings.sync_pin)

    _check_sync_rate(ip, pin_required)

    if pin_required:
        if body.pin != settings.sync_pin:
            _record_failure(ip)
            raise HTTPException(status_code=403, detail="Invalid PIN")

    fresh = await discover_labs()
    added, updated = 0, 0
    for lab in fresh:
        existing = session.exec(select(Lab).where(Lab.slug == lab.slug)).first()
        if existing:
            existing.content = lab.content
            existing.questions_raw = lab.questions_raw
            existing.last_scraped = lab.last_scraped
            existing.page_title = lab.page_title
            existing.is_dynamic = lab.is_dynamic
            existing.url = lab.url
            if lab.ai_topic:
                existing.ai_topic = lab.ai_topic
            session.add(existing)
            updated += 1
        else:
            session.add(lab)
            added += 1
    session.commit()

    _record_success(ip)
    return {"added": added, "updated": updated}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _solution_status(sol, has_steps: bool) -> str:
    """Return a clean, simplified status for the UI."""
    if has_steps:
        return "solved"
    if sol and sol.status == "solving" and sol.solve_status_detail not in ("generation_failed", "generation_failed_fallback"):
        return "solving"
    return "unsolved"


def _format_solution(sol: Solution) -> dict:
    """User-facing solution dict. internal_log is intentionally omitted."""
    has_steps = bool(sol.steps_json and sol.steps_json != "[]")
    return {
        "status": "solved" if has_steps else sol.status,
        "summary": sol.summary,
        "steps": json.loads(sol.steps_json) if sol.steps_json else [],
        "solved_at": sol.solved_at.isoformat() if sol.solved_at else None,
        "ai_model": sol.ai_model,
        "exercise_classification": sol.exercise_classification,
        "classification_reason": sol.classification_reason,
        "content_was_generated": sol.content_was_generated,
        "repair_count": sol.repair_count,
        "solve_status_detail": sol.solve_status_detail,
        "prompt_used": sol.prompt_used,
        "solve_log": sol.solve_log or "",
        # internal_log NOT included — by design
    }
