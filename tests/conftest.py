"""Shared pytest fixtures — isolated in-memory DB per test."""

import os

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

os.environ.setdefault("TIDALDLRU_DB_PATH", ":memory:")
os.environ.setdefault("DATABASE_URL", "sqlite://")


@pytest.fixture(autouse=True)
def _fresh_db():
    from tidal_dl_ru.database import database as db_mod

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    original = db_mod.engine
    db_mod.engine = engine
    try:
        yield
    finally:
        db_mod.engine = original
        engine.dispose()
