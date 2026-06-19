import logging
import os
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

logger = logging.getLogger(__name__)

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


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def run_migrations() -> bool:
    """Apply Alembic migrations. Returns True if Alembic handled schema setup."""
    ini_path = _project_root() / "alembic.ini"
    if not ini_path.is_file():
        logger.debug("alembic.ini not found at %s", ini_path)
        return False

    try:
        from alembic import command
        from alembic.config import Config
        from alembic.runtime.migration import MigrationContext
        from sqlalchemy import inspect
    except ImportError:
        logger.warning("Alembic not installed; using legacy create_all migrations")
        return False

    import tidal_dl_ru.database.models  # noqa: F401
    import tidal_dl_ru.database.refresh_tokens  # noqa: F401
    import tidal_dl_ru.server.activation_codes  # noqa: F401

    cfg = Config(str(ini_path))
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL)

    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn)
        current = ctx.get_current_revision()
        tables = set(inspect(conn).get_table_names())

    if current is None and "user" in tables:
        logger.info("Legacy database detected — stamping Alembic head (brownfield)")
        command.stamp(cfg, "head")
        return True

    command.upgrade(cfg, "head")
    return True


def _migrate_sqlite_columns():
    """Deprecated: superseded by Alembic for new installs; kept for fallback path."""
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
        "email_verified": "BOOLEAN DEFAULT 1",
    }
    missing = {c: ddl for c, ddl in want.items() if c not in have}
    if not missing:
        return
    with engine.begin() as conn:
        for col, ddl in missing.items():
            conn.execute(text(f'ALTER TABLE "user" ADD COLUMN {col} {ddl}'))


def _migrate_savedtrack_columns():
    """Deprecated fallback — columns are in 001_initial Alembic revision."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "savedtrack" not in insp.get_table_names():
        return
    have = {c["name"] for c in insp.get_columns("savedtrack")}
    want = {
        "bpm": "INTEGER",
        "camelot_key": "VARCHAR",
        "musical_key": "VARCHAR",
        "artist_ids_json": "VARCHAR",
        "album_id": "VARCHAR",
        "release_date": "VARCHAR",
    }
    missing = {c: ddl for c, ddl in want.items() if c not in have}
    if not missing:
        return
    is_sqlite = DATABASE_URL.startswith("sqlite")
    with engine.begin() as conn:
        for col, ddl in missing.items():
            if is_sqlite:
                conn.execute(text(f"ALTER TABLE savedtrack ADD COLUMN {col} {ddl}"))
            else:
                conn.execute(
                    text(f"ALTER TABLE savedtrack ADD COLUMN IF NOT EXISTS {col} {ddl}")
                )


def _migrate_playlist_share_token():
    """Deprecated fallback."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "playlist" not in insp.get_table_names():
        return
    have = {c["name"] for c in insp.get_columns("playlist")}
    if "share_token" in have:
        return
    is_sqlite = DATABASE_URL.startswith("sqlite")
    with engine.begin() as conn:
        if is_sqlite:
            conn.execute(text("ALTER TABLE playlist ADD COLUMN share_token VARCHAR"))
        else:
            conn.execute(text("ALTER TABLE playlist ADD COLUMN IF NOT EXISTS share_token VARCHAR"))
        try:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_playlist_share_token ON playlist (share_token)"))
        except Exception as exc:
            logger.debug("playlist share_token index: %s", exc)


def create_db_and_tables():
    import tidal_dl_ru.database.models  # noqa: F401
    import tidal_dl_ru.database.refresh_tokens  # noqa: F401
    import tidal_dl_ru.server.activation_codes  # noqa: F401

    try:
        if run_migrations():
            return
    except Exception as exc:
        logger.warning("Alembic upgrade failed (%s); falling back to create_all", exc)

    SQLModel.metadata.create_all(engine)
    _migrate_sqlite_columns()
    _migrate_savedtrack_columns()
    _migrate_playlist_share_token()


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
