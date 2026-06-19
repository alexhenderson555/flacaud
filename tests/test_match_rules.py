"""Tests for transfer match rules API."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine

from tests.conftest import register_and_login
from tidal_dl_ru.server.app import app


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    import tidal_dl_ru.database.database as db_mod
    import tidal_dl_ru.database.models  # noqa: F401

    test_db = tmp_path / "test_match_rules.db"
    monkeypatch.setattr(db_mod, "_db_path", test_db)
    monkeypatch.setattr(db_mod, "DATABASE_URL", f"sqlite:///{test_db.as_posix()}")
    engine = create_engine(f"sqlite:///{test_db.as_posix()}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(db_mod, "engine", engine)
    SQLModel.metadata.create_all(engine)
    yield
    db_mod.engine = None


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_match_rules_crud(client):
    headers, _uname = register_and_login(client, username="rules_user")
    create = client.post(
        "/api/transfer/match-rules",
        json={
            "source_platform": "spotify",
            "source_title": "VIBES",
            "source_artist": "BRY",
            "tidal_provider_id": "999",
        },
        headers=headers,
    )
    assert create.status_code == 200
    rule_id = create.json()["id"]

    listed = client.get("/api/transfer/match-rules", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    deleted = client.delete(f"/api/transfer/match-rules/{rule_id}", headers=headers)
    assert deleted.status_code == 200
    assert client.get("/api/transfer/match-rules", headers=headers).json() == []
