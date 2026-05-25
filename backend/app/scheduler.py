"""APScheduler: periodically re-scrape for new labs/homework/projects."""
import asyncio

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlmodel import Session, select

from .config import settings
from .database import engine
from .models import Lab
from .scraper import discover_labs
from .github_watchers import sync_repo_watchers

scheduler = AsyncIOScheduler()


async def _sync_labs():
    print("[scheduler] Syncing labs from site...")
    fresh_labs = await discover_labs()
    new_slugs: list[str] = []
    with Session(engine) as session:
        for lab in fresh_labs:
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
            else:
                session.add(lab)
                new_slugs.append(lab.slug)
                print(f"[scheduler] New lab discovered: {lab.slug}")
        session.commit()
    print(f"[scheduler] Synced {len(fresh_labs)} labs")

    # Auto-solve any newly discovered labs without blocking the scheduler job
    if new_slugs:
        print(f"[scheduler] Queuing auto-solve for {len(new_slugs)} new lab(s)...")
        asyncio.create_task(_auto_solve_slugs(new_slugs))


async def _auto_solve_slugs(slugs: list[str]) -> None:
    """Solve a specific list of lab slugs (called after scheduler discovers new labs)."""
    from .routers.labs import _do_solve_pipeline
    from .models import Solution

    MAX_RETRIES = 3
    for slug in slugs:
        last_error = ""
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                with Session(engine) as session:
                    lab = session.exec(select(Lab).where(Lab.slug == slug)).first()
                    if not lab:
                        break
                    existing = session.exec(
                        select(Solution).where(Solution.lab_slug == slug)
                    ).first()
                    await _do_solve_pipeline(lab, session, existing, force=(attempt > 1), previous_error=last_error)
                print(f"[scheduler] ✓ auto-solved {slug}")
                break
            except Exception as exc:
                last_error = str(exc)
                print(f"[scheduler] ✗ {slug} attempt {attempt}/{MAX_RETRIES}: {exc}")
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(5 * attempt)
        await asyncio.sleep(1)


async def _sync_watchers():
    """Snapshot current GitHub repo watchers/subscribers."""
    try:
        with Session(engine) as session:
            result = await sync_repo_watchers(session)
        if result.get("new_count"):
            print(f"[watchers] {result['new_count']} new watcher(s) recorded")
    except Exception as exc:
        print(f"[watchers] Sync failed: {exc}")


def start_scheduler():
    scheduler.add_job(
        _sync_labs,
        trigger=IntervalTrigger(minutes=settings.scrape_interval_minutes),
        id="sync_labs",
        replace_existing=True,
    )
    scheduler.add_job(
        _sync_watchers,
        trigger=IntervalTrigger(minutes=settings.watcher_check_interval_minutes),
        id="sync_watchers",
        replace_existing=True,
    )
    scheduler.start()


def stop_scheduler():
    scheduler.shutdown(wait=False)
