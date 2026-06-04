import os
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

# SQLite path (default) or full DATABASE_URL (Postgres in production).
_db_path = Path(
    os.environ.get(
        "TIDALDLRU_DB_PATH",
        str(Path.home() / ".local" / "share" / "tidal-dl-ru" / "flacaudio.db"),
    )
)
_db_path.parent.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{_db_path.as_posix()}"


def _engine_connect_args(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


def _engine_pool(url: str):
    if url.startswith("sqlite"):
        from sqlalchemy.pool import NullPool
        return NullPool
    return None


engine = create_engine(
    DATABASE_URL,
    connect_args=_engine_connect_args(DATABASE_URL),
    poolclass=_engine_pool(DATABASE_URL),
)


def _migrate_sqlite_columns():
    """Add columns missing from an older `user` table (SQLite only)."""
    if not DATABASE_URL.startswith("sqlite"):
        return
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
    import tidal_dl_ru.database.models  # noqa: F401
    import tidal_dl_ru.server.activation_codes  # noqa: F401 — ActivationCode table

    SQLModel.metadata.create_all(engine)
    _migrate_sqlite_columns()


def get_session():
    with Session(engine) as session:
        yield session


def check_db() -> bool:
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
