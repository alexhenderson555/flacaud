from tidal_dl_ru.server.ai_playlist_cache import cache_get, cache_set


def test_ai_playlist_cache_roundtrip():
    cache_set("night drive", 10, [{"provider_id": "1"}])
    hit = cache_get("night drive", 10)
    assert hit is not None
    assert hit[0]["provider_id"] == "1"
    assert cache_get("other", 10) is None
