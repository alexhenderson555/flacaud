import os
from pathlib import Path
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy.orm import sessionmaker

# Absolute, env-configurable DB path. The previous "./flacaudio.db" default was
# relative to the process CWD, so in Docker (no volume there) the user DB was wiped
# on every restart — surfacing as "invalid credentials" after a redeploy. Mount a
# volume at the parent dir and set TIDALDLRU_DB_PATH to persist accounts.
_db_path = Path(
    os.environ.get(
        "TIDALDLRU_DB_PATH",
        str(Path.home() / ".local" / "share" / "tidal-dl-ru" / "flacaudio.db"),
    )
)
_db_path.parent.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{_db_path.as_posix()}"

from sqlalchemy.pool import NullPool

# Setting check_same_thread=False is needed in SQLite for FastAPI dependencies
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=NullPool)

def _migrate_sqlite_columns():
    """Add columns missing from an older `user` table so the unified schema
    doesn't crash on a pre-existing DB (SQLModel.create_all only creates
    missing tables, never missing columns). Idempotent: only adds what's absent.
    """
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "user" not in insp.get_table_names():
        return
    have = {c["name"] for c in insp.get_columns("user")}
    want = {
        "email": "VARCHAR", "username": "VARCHAR", "hashed_password": "VARCHAR",
        "created_at": "DATETIME", "telegram_id": "INTEGER", "first_name": "VARCHAR",
        "plan": "VARCHAR DEFAULT 'free'", "subscription_expires_at": "DATETIME",
        "downloads_today": "INTEGER DEFAULT 0", "total_downloads": "INTEGER DEFAULT 0",
        "quota_reset_at": "DATETIME", "karaoke_enabled": "BOOLEAN DEFAULT 0",
        "dj_enabled": "BOOLEAN DEFAULT 0",
    }
    missing = {c: ddl for c, ddl in want.items() if c not in have}
    if not missing:
        return
    with engine.begin() as conn:
        for col, ddl in missing.items():
            conn.execute(text(f'ALTER TABLE "user" ADD COLUMN {col} {ddl}'))


def create_db_and_tables():
    # Import models so their tables are registered on SQLModel.metadata before
    # create_all — otherwise nothing is created if models weren't imported yet.
    import tidal_dl_ru.database.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _migrate_sqlite_columns()

def get_session():
    with Session(engine) as session:
        yield session
