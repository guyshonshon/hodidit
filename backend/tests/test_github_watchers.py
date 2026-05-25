import asyncio

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine, select

from backend.app import github_watchers
from backend.app.github_watchers import sync_repo_watchers
from backend.app.models import RepoWatcher


def test_sync_repo_watchers_tracks_new_and_removed_watchers(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    snapshots = [
        [
            {"login": "alice", "id": 1, "avatar_url": "https://img/alice", "html_url": "https://github.com/alice", "type": "User"},
            {"login": "bob", "id": 2, "avatar_url": "https://img/bob", "html_url": "https://github.com/bob", "type": "User"},
        ],
        [
            {"login": "bob", "id": 2, "avatar_url": "https://img/bob", "html_url": "https://github.com/bob", "type": "User"},
        ],
    ]

    async def fake_metadata(client, repo):
        return {"subscribers_count": len(snapshots[0]), "stargazers_count": 7, "watchers_count": 7}

    async def fake_subscribers(client, repo):
        return snapshots.pop(0)

    monkeypatch.setattr(github_watchers, "_fetch_repo_metadata", fake_metadata)
    monkeypatch.setattr(github_watchers, "_fetch_subscribers", fake_subscribers)

    with Session(engine) as session:
        first = asyncio.run(sync_repo_watchers(session, repo="owner/repo"))
        assert first["new_count"] == 2
        assert [w["login"] for w in first["current_watchers"]] == ["alice", "bob"]

        second = asyncio.run(sync_repo_watchers(session, repo="owner/repo"))
        assert second["new_count"] == 0
        assert [w["login"] for w in second["current_watchers"]] == ["bob"]

        alice = session.exec(
            select(RepoWatcher).where(RepoWatcher.repo == "owner/repo", RepoWatcher.login == "alice")
        ).one()
        assert alice.is_current is False
