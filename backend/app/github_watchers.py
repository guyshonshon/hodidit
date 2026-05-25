"""GitHub watcher/subscriber tracking.

GitHub exposes users who explicitly watch a repository through the
`/repos/{owner}/{repo}/subscribers` API. This does not include anonymous page
views, clones, or private activity that GitHub does not expose.
"""
from datetime import datetime
from typing import Any

import httpx
from sqlmodel import Session, select

from .config import settings
from .models import RepoWatcher


WATCH_FALLBACK_REPO = "guyshonshon/hodidit"


def resolve_watch_repo() -> str:
    """Return the repo configured for watcher tracking."""
    return (
        (settings.watch_github_repo or "").strip()
        or (settings.github_repo or "").strip()
        or WATCH_FALLBACK_REPO
    )


def _github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "hodidit-watcher-tracker",
    }
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


async def _fetch_repo_metadata(client: httpx.AsyncClient, repo: str) -> dict[str, Any]:
    response = await client.get(f"https://api.github.com/repos/{repo}")
    response.raise_for_status()
    return response.json()


async def _fetch_subscribers(client: httpx.AsyncClient, repo: str) -> list[dict[str, Any]]:
    subscribers: list[dict[str, Any]] = []
    page = 1
    while True:
        response = await client.get(
            f"https://api.github.com/repos/{repo}/subscribers",
            params={"per_page": 100, "page": page},
        )
        response.raise_for_status()
        batch = response.json()
        if not batch:
            break
        subscribers.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return subscribers


def _serialize_watcher(watcher: RepoWatcher, *, is_new: bool = False) -> dict[str, Any]:
    return {
        "login": watcher.login,
        "github_id": watcher.github_id,
        "avatar_url": watcher.avatar_url,
        "html_url": watcher.html_url,
        "type": watcher.type,
        "site_admin": watcher.site_admin,
        "is_current": watcher.is_current,
        "is_new": is_new,
        "first_seen_at": watcher.first_seen_at.isoformat(),
        "last_seen_at": watcher.last_seen_at.isoformat(),
        "last_checked_at": watcher.last_checked_at.isoformat(),
    }


async def sync_repo_watchers(session: Session, repo: str | None = None) -> dict[str, Any]:
    """Fetch current GitHub watchers and persist a snapshot."""
    repo = (repo or resolve_watch_repo()).strip()
    now = datetime.utcnow()

    async with httpx.AsyncClient(timeout=20, headers=_github_headers(), follow_redirects=True) as client:
        metadata = await _fetch_repo_metadata(client, repo)
        subscribers = await _fetch_subscribers(client, repo)

    existing = {
        watcher.login: watcher
        for watcher in session.exec(select(RepoWatcher).where(RepoWatcher.repo == repo)).all()
    }
    current_logins = {str(user.get("login", "")).strip() for user in subscribers if user.get("login")}
    new_logins: set[str] = set()

    for user in subscribers:
        login = str(user.get("login", "")).strip()
        if not login:
            continue
        watcher = existing.get(login)
        if watcher is None:
            watcher = RepoWatcher(
                repo=repo,
                login=login,
                first_seen_at=now,
            )
            new_logins.add(login)
        watcher.github_id = user.get("id")
        watcher.avatar_url = user.get("avatar_url")
        watcher.html_url = user.get("html_url")
        watcher.type = user.get("type")
        watcher.site_admin = bool(user.get("site_admin", False))
        watcher.is_current = True
        watcher.last_seen_at = now
        watcher.last_checked_at = now
        session.add(watcher)
        existing[login] = watcher

    for login, watcher in existing.items():
        if login in current_logins:
            continue
        watcher.is_current = False
        watcher.last_checked_at = now
        session.add(watcher)

    session.commit()

    stored = session.exec(select(RepoWatcher).where(RepoWatcher.repo == repo)).all()
    current = sorted((w for w in stored if w.is_current), key=lambda w: w.login.lower())
    historical = sorted(stored, key=lambda w: w.login.lower())
    new_current = [w for w in current if w.login in new_logins]

    if new_current:
        print(f"[watchers] New watcher(s) for {repo}: {', '.join(w.login for w in new_current)}")

    return {
        "repo": repo,
        "checked_at": now.isoformat(),
        "subscribers_count": metadata.get("subscribers_count", len(current)),
        "stargazers_count": metadata.get("stargazers_count", 0),
        # GitHub's watchers_count is historically star-related; keep both labels visible.
        "github_watchers_count": metadata.get("watchers_count", 0),
        "current_count": len(current),
        "known_count": len(historical),
        "new_count": len(new_current),
        "new_watchers": [_serialize_watcher(w, is_new=True) for w in new_current],
        "current_watchers": [_serialize_watcher(w, is_new=w.login in new_logins) for w in current],
        "known_watchers": [_serialize_watcher(w, is_new=False) for w in historical],
        "note": "GitHub exposes explicit repository subscribers only; anonymous visits and clones are not available.",
    }
