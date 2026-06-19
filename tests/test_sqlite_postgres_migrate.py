"""SQLite → Postgres data copy (integration)."""

from pathlib import Path

from sqlalchemy import create_engine, inspect
from sqlmodel import Session, SQLModel

from tidal_dl_ru.ops.sqlite_migrate import migrate


def test_sqlite_to_postgres_roundtrip(tmp_path):
    import tidal_dl_ru.database.models  # noqa: F401
    import tidal_dl_ru.database.refresh_tokens  # noqa: F401
    import tidal_dl_ru.server.activation_codes  # noqa: F401
    from tidal_dl_ru.database.models import User

    sqlite_file = tmp_path / "src.db"
    pg_url = f"sqlite:///{(tmp_path / 'dst.db').as_posix()}"

    src_engine = create_engine(f"sqlite:///{sqlite_file.as_posix()}", connect_args={"check_same_thread": False})
    dst_engine = create_engine(pg_url, connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(src_engine)
    SQLModel.metadata.create_all(dst_engine)
    with Session(src_engine) as s:
        s.add(User(username="pg_migrate", email="m@t.local", plan="free"))
        s.commit()

    # Use second sqlite as stand-in when postgres not in CI unit job
    migrate(sqlite_file, pg_url)

    with Session(dst_engine) as s:
        users = s.exec(__import__("sqlmodel", fromlist=["select"]).select(User)).all()
        assert len(users) == 1
        assert users[0].username == "pg_migrate"

    assert "user" in inspect(dst_engine).get_table_names()
