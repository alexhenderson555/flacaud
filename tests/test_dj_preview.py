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
