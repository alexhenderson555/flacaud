from tidal_dl_ru.server import rec_cache
from tidal_dl_ru.server.rec_cache import cache_get, cache_set, cache_stats


def test_rec_cache_roundtrip(monkeypatch):
    monkeypatch.setattr(rec_cache, "_TTL_SEC", 120.0)
    cache_set("u1", 10, [{"id": "1"}])
    assert cache_get("u1", 10) == [{"id": "1"}]
    assert cache_get("u1", 20) is None
    stats = cache_stats()
    assert stats["ttl_sec"] == 120.0


def test_rec_cache_disabled_when_ttl_zero(monkeypatch):
    rec_cache._store.clear()
    monkeypatch.setattr(rec_cache, "_TTL_SEC", 0.0)
    cache_set("u1", 10, [{"id": "1"}])
    assert cache_get("u1", 10) is None


def test_rec_cache_expiry(monkeypatch):
    import time as _time
    rec_cache._store.clear()
    monkeypatch.setattr(rec_cache, "_TTL_SEC", 120.0)
    cache_set("expire", 5, [{"id": "x"}])
    # Force time forward
    orig_time = rec_cache.time.monotonic()
    monkeypatch.setattr(rec_cache.time, "monotonic", lambda: orig_time + 121)
    assert cache_get("expire", 5) is None


def test_rec_cache_invalidate_specific_limit(monkeypatch):
    rec_cache._store.clear()
    monkeypatch.setattr(rec_cache, "_TTL_SEC", 120.0)
    cache_set("u1", 10, [{"id": "1"}])
    cache_set("u1", 20, [{"id": "2"}])
    from tidal_dl_ru.server.rec_cache import cache_invalidate
    cache_invalidate("u1", 10)
    assert cache_get("u1", 10) is None
    assert cache_get("u1", 20) == [{"id": "2"}]


def test_rec_cache_invalidate_all_limits(monkeypatch):
    rec_cache._store.clear()
    monkeypatch.setattr(rec_cache, "_TTL_SEC", 120.0)
    cache_set("u1", 10, [{"id": "1"}])
    cache_set("u1", 20, [{"id": "2"}])
    from tidal_dl_ru.server.rec_cache import cache_invalidate
    cache_invalidate("u1")
    assert cache_get("u1", 10) is None
    assert cache_get("u1", 20) is None


def test_rec_cache_stats_active(monkeypatch):
    rec_cache._store.clear()
    monkeypatch.setattr(rec_cache, "_TTL_SEC", 120.0)
    cache_set("u1", 10, [{"id": "1"}])
    stats = cache_stats()
    assert stats["entries"] == 1
    assert stats["active"] == 1


def test_rec_cache_stats_expired_not_active(monkeypatch):
    import time as _time
    rec_cache._store.clear()
    monkeypatch.setattr(rec_cache, "_TTL_SEC", 120.0)
    cache_set("u1", 10, [{"id": "1"}])
    orig_time = rec_cache.time.monotonic()
    monkeypatch.setattr(rec_cache.time, "monotonic", lambda: orig_time + 121)
    stats = cache_stats()
    assert stats["entries"] == 1
    assert stats["active"] == 0
