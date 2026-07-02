"""Tests for one-time token consumption."""

from unittest.mock import MagicMock

from tidal_dl_ru.server import one_time_tokens as ott


def test_consume_token_first_time_succeeds(monkeypatch):
    ott._mem.clear()
    fake_redis = MagicMock()
    fake_redis.get = MagicMock(return_value=None)
    fake_redis.setex = MagicMock()
    monkeypatch.setattr("tidal_dl_ru.server.jobs._client", lambda: fake_redis)
    assert ott.consume_token("reset", "token123", 3600) is True


def test_consume_token_replay_rejected(monkeypatch):
    ott._mem.clear()
    fake_redis = MagicMock()
    fake_redis.get = MagicMock(return_value="1")
    fake_redis.setex = MagicMock()
    monkeypatch.setattr("tidal_dl_ru.server.jobs._client", lambda: fake_redis)
    assert ott.consume_token("reset", "token123", 3600) is False


def test_consume_token_fallback_to_memory(monkeypatch):
    ott._mem.clear()
    # Simulate Redis failure
    def boom():
        raise Exception("no redis")
    monkeypatch.setattr("tidal_dl_ru.server.jobs._client", boom)
    assert ott.consume_token("reset", "token456", 3600) is True
    # Replay in memory
    assert ott.consume_token("reset", "token456", 3600) is False


def test_consume_token_memory_expiry(monkeypatch):
    ott._mem.clear()
    monkeypatch.setattr("tidal_dl_ru.server.jobs._client", lambda: (_ for _ in ()).throw(Exception("no redis")))
    import time as _time
    orig_time = _time.time()
    monkeypatch.setattr(ott.time, "time", lambda: orig_time)
    ott.consume_token("reset", "expire_me", 1)
    # Advance time past TTL
    monkeypatch.setattr(ott.time, "time", lambda: orig_time + 2)
    # Should succeed again since expired
    assert ott.consume_token("reset", "expire_me", 1) is True


def test_consume_token_different_namespaces_independent(monkeypatch):
    ott._mem.clear()
    def boom():
        raise Exception("no redis")
    monkeypatch.setattr("tidal_dl_ru.server.jobs._client", boom)
    assert ott.consume_token("reset", "same_token", 3600) is True
    assert ott.consume_token("verify", "same_token", 3600) is True
