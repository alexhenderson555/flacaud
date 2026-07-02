"""Tests for artist bio TTL cache."""

import time

from tidal_dl_ru.server.artist_bio_cache import bio_cache_get, bio_cache_set


def test_cache_miss_returns_none():
    assert bio_cache_get("artist1", "en") is None


def test_cache_set_then_get():
    bio_cache_set("artist1", "en", "Bio text")
    assert bio_cache_get("artist1", "en") == "Bio text"


def test_cache_keyed_by_lang():
    bio_cache_set("artist1", "en", "English bio")
    bio_cache_set("artist1", "ru", "Russian bio")
    assert bio_cache_get("artist1", "en") == "English bio"
    assert bio_cache_get("artist1", "ru") == "Russian bio"


def test_cache_keyed_by_artist():
    bio_cache_set("artist1", "en", "Bio 1")
    bio_cache_set("artist2", "en", "Bio 2")
    assert bio_cache_get("artist1", "en") == "Bio 1"
    assert bio_cache_get("artist2", "en") == "Bio 2"


def test_cache_expiry(monkeypatch):
    import tidal_dl_ru.server.artist_bio_cache as mod

    monkeypatch.setattr(mod, "_TTL_SEC", 0.01)
    bio_cache_set("expire_me", "en", "temp")
    time.sleep(0.02)
    assert bio_cache_get("expire_me", "en") is None
