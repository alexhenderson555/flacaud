"""Cached set audio API."""

import pytest
from fastapi.testclient import TestClient

from tidal_dl_ru.core import set_audio_cache as cache_mod
from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.models import User
from tidal_dl_ru.server.app import app


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_cached_set_audio_requires_auth(client):
    r = client.head("/api/sets/cached-audio", params={"url": "https://soundcloud.com/x/y"})
    assert r.status_code in (401, 403)


def test_cached_set_audio_head_and_get(client, tmp_path, monkeypatch):
    monkeypatch.setattr(cache_mod.settings, "set_audio_cache_dir", tmp_path)
    url = "https://soundcloud.com/dj/live"
    src = tmp_path / "source.mp3"
    src.write_bytes(b"ID3fake")
    cache_mod.store_set_audio(url, src)

    app.dependency_overrides[get_current_user] = lambda: User(
        id=1,
        email="a@b.c",
        username="u",
        hashed_password="x",
    )
    try:
        head = client.head("/api/sets/cached-audio", params={"url": url})
        assert head.status_code == 200
        get = client.get("/api/sets/cached-audio", params={"url": url})
        assert get.status_code == 200
        assert get.content.startswith(b"ID3")
    finally:
        app.dependency_overrides.clear()
