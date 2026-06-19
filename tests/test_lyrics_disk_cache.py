import json

from tidal_dl_ru.core import lyrics as mod


def test_disk_cache_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(mod, "_DISK_CACHE_DIR", tmp_path / "lyrics")
    key = "isrc:USUM123"
    mod._save_disk_cache(key, "[00:01.00]Hello")
    hit, text = mod._read_disk_cache(key)
    assert hit is True
    assert "Hello" in (text or "")

    mod._save_disk_cache(key, "")
    hit2, text2 = mod._read_disk_cache(key)
    assert hit2 is True
    assert text2 is None
