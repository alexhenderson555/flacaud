"""Shared pytest fixtures — isolated in-memory DB per test."""

import os
import uuid

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

os.environ.setdefault("TIDALDLRU_DB_PATH", ":memory:")
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("TIDALDLRU_ENV", "test")
os.environ.setdefault("TIDALDLRU_OPS_API_KEY", "test-ops-key")


def ops_headers() -> dict[str, str]:
    return {"X-Ops-Key": os.environ.get("TIDALDLRU_OPS_API_KEY", "test-ops-key")}


@pytest.fixture(autouse=True)
def _reset_rate_limit_memory():
    """In-memory rate buckets are global; reset so auth fixtures do not flake after test_middleware."""
    from tidal_dl_ru.server import middleware as mw

    mw._memory.clear()
    yield
    mw._memory.clear()


def register_and_login(client, *, username: str | None = None, email: str | None = None, password: str = "secret-pass-123"):
    """Register + login; returns (auth_headers, username)."""
    uname = username or f"user_{uuid.uuid4().hex[:10]}"
    mail = email or f"{uname}@test.local"
    reg = client.post(
        "/api/auth/register",
        json={"email": mail, "username": uname, "password": password, "accept_terms": True},
    )
    assert reg.status_code == 200, reg.text
    login = client.post(
        "/api/auth/login",
        data={"username": uname, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.text
    body = login.json()
    assert "access_token" in body, body
    return {"Authorization": f"Bearer {body['access_token']}"}, uname


@pytest.fixture(autouse=True)
def _fresh_db():
    from tidal_dl_ru.database import database as db_mod

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import tidal_dl_ru.database.models  # noqa: F401
    import tidal_dl_ru.database.refresh_tokens  # noqa: F401
    import tidal_dl_ru.server.activation_codes  # noqa: F401

    SQLModel.metadata.create_all(engine)
    original = db_mod.engine
    db_mod.engine = engine
    try:
        yield
    finally:
        db_mod.engine = original
        engine.dispose()
