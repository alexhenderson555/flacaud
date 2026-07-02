"""Tests for server DJ preview helpers."""

from pathlib import Path

import pytest

from tidal_dl_ru.server import dj_preview as dp


def test_cache_roundtrip():
    dp._meta_cache.clear()
    dp._fail_until.clear()
    dp._cache_put("123", {"bpm": 128, "musical_key": "Am", "camelot_key": "8A"})
    assert dp._cache_get("123")["bpm"] == 128
    assert dp._cache_get("999") is None


def test_recently_failed_cooldown():
    dp._fail_until.clear()
    dp._mark_failed("42")
    assert dp._recently_failed("42") is True


def test_source_from_redirect():
    src = dp._source_from_stream_info(
        {"type": "redirect", "url": "https://audio.tidal.com/track.aac"},
        "1",
        Path("/tmp"),
    )
    assert src == "https://audio.tidal.com/track.aac"


def test_source_from_file(tmp_path):
    audio = tmp_path / "t.flac"
    audio.write_bytes(b"x" * 2000)
    src = dp._source_from_stream_info(
        {"type": "file", "path": str(audio)},
        "2",
        tmp_path,
    )
    assert src == audio


def test_analyze_wav_requires_bpm_and_key(tmp_path, monkeypatch):
    wav = tmp_path / "clip.wav"
    wav.write_bytes(b"fake")

    monkeypatch.setattr(dp, "analyze_and_tag", lambda _p: {"bpm": "128", "key": "Am", "camelot": "8A"})
    out = dp._analyze_wav(wav)
    assert out == {"bpm": 128, "musical_key": "Am", "camelot_key": "8A"}

    monkeypatch.setattr(dp, "analyze_and_tag", lambda _p: {"bpm": None, "key": None})
    assert dp._analyze_wav(wav) is None


def test_cache_expiry(monkeypatch):
    dp._meta_cache.clear()
    dp._cache_put("expire", {"bpm": 90})
    # Force time forward beyond TTL
    import tidal_dl_ru.server.dj_preview as mod
    orig_time = mod.time.time()
    monkeypatch.setattr(mod.time, "time", lambda: orig_time + dp._CACHE_TTL_SEC + 1)
    assert dp._cache_get("expire") is None


def test_recently_failed_expires(monkeypatch):
    dp._fail_until.clear()
    dp._mark_failed("temp")
    assert dp._recently_failed("temp") is True
    import tidal_dl_ru.server.dj_preview as mod
    orig_time = mod.time.time()
    monkeypatch.setattr(mod.time, "time", lambda: orig_time + dp._FAIL_COOLDOWN_SEC + 1)
    assert dp._recently_failed("temp") is False


def test_analyze_empty_track_id():
    assert dp.analyze_tidal_track_preview("") is None
    assert dp.analyze_tidal_track_preview("   ") is None


def test_analyze_returns_cached():
    dp._meta_cache.clear()
    dp._fail_until.clear()
    dp._cache_put("cached_track", {"bpm": 120, "musical_key": "C", "camelot_key": "1A"})
    assert dp.analyze_tidal_track_preview("cached_track") == {"bpm": 120, "musical_key": "C", "camelot_key": "1A"}


def test_analyze_returns_none_when_recently_failed():
    dp._meta_cache.clear()
    dp._fail_until.clear()
    dp._mark_failed("failed_track")
    assert dp.analyze_tidal_track_preview("failed_track") is None


def test_analyze_returns_none_when_no_ffmpeg(monkeypatch):
    dp._meta_cache.clear()
    dp._fail_until.clear()
    monkeypatch.setattr(dp.shutil, "which", lambda cmd: None)
    assert dp.analyze_tidal_track_preview("no_ffmpeg_track") is None


def test_source_from_dash_stream_dict(monkeypatch):
    """dash_stream with dict manifest (BTS) returns first URL."""
    dp._meta_cache.clear()
    from unittest.mock import MagicMock
    fake_manifest = MagicMock()
    fake_manifest.manifest = "eyJ1cmxzIjpbImh0dHBzOi8vc2VnMS50aWRhbC5jb20vaW5pdC5tcDQiXX0="
    fake_manifest.manifest_mime_type = "application/vnd.tidal.bts"
    info = {
        "type": "dash_stream",
        "manifest": fake_manifest,
    }
    src = dp._source_from_stream_info(info, "t1", Path("/tmp"))
    # BTS manifest with urls key → returns first URL
    assert src is not None


def test_source_from_unknown_type_returns_none():
    assert dp._source_from_stream_info({"type": "unknown"}, "t1", Path("/tmp")) is None


def test_source_from_file_not_found(tmp_path):
    src = dp._source_from_stream_info(
        {"type": "file", "path": str(tmp_path / "nonexistent.flac")},
        "t1",
        tmp_path,
    )
    assert src is None


def test_download_dash_preview_empty_urls(tmp_path):
    assert dp._download_dash_preview([], tmp_path / "out.mp4") is False
