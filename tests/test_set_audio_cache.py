"""Set audio cache helpers."""

from pathlib import Path

from tidal_dl_ru.core import set_audio_cache as mod


def test_cache_key_stable():
    a = mod.cache_key("https://soundcloud.com/foo/bar")
    b = mod.cache_key("  https://soundcloud.com/foo/bar  ")
    assert a == b


def test_store_and_probe(tmp_path, monkeypatch):
    monkeypatch.setattr(mod.settings, "set_audio_cache_dir", tmp_path)
    src = tmp_path / "source.mp3"
    src.write_bytes(b"fake-mp3")
    url = "https://soundcloud.com/dj/set"
    dest = mod.store_set_audio(url, src)
    assert dest is not None
    assert mod.has_cached_set_audio(url)
    assert mod.cache_path(url).is_file()


def test_missing_source_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(mod.settings, "set_audio_cache_dir", tmp_path)
    assert mod.store_set_audio("https://x", Path("/no/such/file.mp3")) is None
