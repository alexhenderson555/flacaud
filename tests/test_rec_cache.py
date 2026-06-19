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
