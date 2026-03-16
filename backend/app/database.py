from sqlmodel import SQLModel, create_engine, Session
from .config import settings

engine = create_engine(settings.database_url, echo=False, connect_args={"check_same_thread": False})


def init_db():
    SQLModel.metadata.create_all(engine)
    _migrate_db()


def _migrate_db():
    """Apply additive column migrations for new fields. Safe to run repeatedly."""
    migrations = [
        # Lab table additions
        "ALTER TABLE lab ADD COLUMN page_title TEXT",
        "ALTER TABLE lab ADD COLUMN is_dynamic INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE lab ADD COLUMN ai_topic TEXT",
        # Solution table additions
        "ALTER TABLE solution ADD COLUMN exercise_classification TEXT NOT NULL DEFAULT 'normal'",
        "ALTER TABLE solution ADD COLUMN content_was_generated INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE solution ADD COLUMN repair_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE solution ADD COLUMN solve_status_detail TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE solution ADD COLUMN internal_log TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE solution ADD COLUMN prompt_used TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE solution ADD COLUMN classification_reason TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE solution ADD COLUMN solve_log TEXT NOT NULL DEFAULT ''",
    ]
    with engine.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(_text(stmt))
                conn.commit()
            except Exception as exc:
                msg = str(exc).lower()
                if "duplicate column" in msg or "already exists" in msg:
                    conn.rollback()
                else:
                    raise


def _text(sql: str):
    from sqlalchemy import text
    return text(sql)


def get_session():
    with Session(engine) as session:
        yield session
