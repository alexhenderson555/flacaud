"""Alembic migration smoke tests."""

import importlib.util

import pytest
from sqlalchemy import inspect, text

pytestmark = pytest.mark.skipif(
    importlib.util.find_spec("alembic") is None,
    reason="alembic not installed",
)


@pytest.fixture()
def alembic_db_file(tmp_path, monkeypatch):
    db_file = tmp_path / "alembic_test.db"
    url = f"sqlite:///{db_file.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", url)

    from sqlmodel import create_engine

    import tidal_dl_ru.database.database as db_mod

    new_engine = create_engine(url, connect_args={"check_same_thread": False})
    monkeypatch.setattr(db_mod, "DATABASE_URL", url)
    monkeypatch.setattr(db_mod, "engine", new_engine)
    yield db_mod
    new_engine.dispose()


def test_fresh_db_upgrade_creates_core_tables(alembic_db_file):
    alembic_db_file.create_db_and_tables()
    with alembic_db_file.engine.connect() as conn:
        tables = set(inspect(conn).get_table_names())
        assert "user" in tables
        assert "savedtrack" in tables
        assert "playlist" in tables
        assert "savedset" in tables
        assert "activationcode" in tables
        assert "transfermatchrule" in tables
        assert "playlisttrack" in tables
        assert "processedpayment" in tables
        assert "savedalbum" in tables
        row = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        assert row == "007_saved_albums"


def test_legacy_db_gets_stamped_not_recreated(alembic_db_file):
    """Brownfield: tables from create_all + stamp, no duplicate CREATE errors."""
    from sqlmodel import SQLModel

    import tidal_dl_ru.database.models  # noqa: F401
    import tidal_dl_ru.server.activation_codes  # noqa: F401

    SQLModel.metadata.create_all(alembic_db_file.engine)
    alembic_db_file.create_db_and_tables()

    with alembic_db_file.engine.connect() as conn:
        row = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        assert row == "007_saved_albums"
