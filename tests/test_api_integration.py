"""Integration tests for the jobs router's auth + ownership guards.

Uses FastAPI dependency overrides and a stubbed job_state, so these need
neither Redis nor a database — they exercise the real routing + guards.
"""

import pytest
from fastapi.testclient import TestClient

from tidal_dl_ru.server.app import app
from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.models import User
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.schemas import JobStatus

client = TestClient(app)


def _user(uid: int) -> User:
    return User(id=uid, username=f"u{uid}")


def _stub_job(monkeypatch, owner_id):
    monkeypatch.setattr(
        job_state,
        "load",
        lambda jid: JobStatus(
            job_id=jid, owner_id=owner_id, status="done", created_at=0.0, updated_at=0.0
        ),
    )


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


class TestJobsRequireAuth:
    def test_status_requires_auth(self):
        assert client.get("/api/jobs/whatever").status_code == 401

    def test_create_requires_auth(self):
        assert client.post("/api/jobs", json={"url": "https://example.com/x"}).status_code == 401

    def test_zip_requires_auth(self):
        assert client.get("/api/jobs/whatever/zip").status_code == 401


class TestJobOwnership:
    def test_other_users_job_is_forbidden(self, monkeypatch):
        _stub_job(monkeypatch, owner_id=1)
        app.dependency_overrides[get_current_user] = lambda: _user(2)
        assert client.get("/api/jobs/abc").status_code == 403

    def test_owner_can_read_own_job(self, monkeypatch):
        _stub_job(monkeypatch, owner_id=1)
        app.dependency_overrides[get_current_user] = lambda: _user(1)
        r = client.get("/api/jobs/abc")
        assert r.status_code == 200
        assert r.json()["owner_id"] == 1

    def test_legacy_ownerless_job_is_readable(self, monkeypatch):
        """Jobs created before owner_id existed (owner_id=None) stay readable."""
        _stub_job(monkeypatch, owner_id=None)
        app.dependency_overrides[get_current_user] = lambda: _user(99)
        assert client.get("/api/jobs/abc").status_code == 200


class TestMediaToken:
    def test_sign_verify_roundtrip(self):
        from tidal_dl_ru.database.auth import sign_media_token, verify_media_token

        assert verify_media_token(sign_media_token(42)) == 42

    def test_garbage_token_rejected(self):
        from tidal_dl_ru.database.auth import verify_media_token

        assert verify_media_token("not-a-real-token") is None

    def test_media_token_endpoint_requires_auth(self):
        assert client.get("/api/auth/media-token").status_code == 401

    def test_zip_rejects_bad_media_token(self):
        # get_media_user must reject an invalid ?mt= rather than fall through.
        assert client.get("/api/jobs/whatever/zip?mt=garbage").status_code == 401
