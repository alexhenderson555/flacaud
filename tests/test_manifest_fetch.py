"""Tests for manifest cache + pool rotation helpers."""

from __future__ import annotations

import base64
import json
from unittest.mock import MagicMock, patch

import httpx
import pytest

from tidal_dl_ru.providers.tidal import manifest_cache
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.manifest_fetch import fetch_playback_manifest
from tidal_dl_ru.providers.tidal.models import AudioQuality, PlaybackManifest


def _bts_manifest() -> PlaybackManifest:
    body = {"urls": ["https://cdn.example/track.m4a"], "codecs": "mp4a.40.2"}
    payload = base64.b64encode(json.dumps(body).encode()).decode()
    return PlaybackManifest(
        trackId=1,
        audioQuality="HIGH",
        manifestMimeType="application/vnd.tidal.bts",
        manifest=payload,
    )


@pytest.fixture(autouse=True)
def _clear_caches():
    manifest_cache.clear_for_tests()
    tidal_pool.clear_cooldowns_for_tests()
    yield
    manifest_cache.clear_for_tests()
    tidal_pool.clear_cooldowns_for_tests()


def test_manifest_cache_hit_avoids_client():
    manifest = _bts_manifest()
    manifest_cache.put("99", "HIGH", manifest)
    client = MagicMock()
    got, limited = fetch_playback_manifest("99", AudioQuality.HIGH, client=client)
    assert got is manifest
    assert limited is False
    client.get_playback_manifest.assert_not_called()


def test_rate_limited_account_is_excluded_on_rotation():
    manifest = _bts_manifest()
    acc1 = MagicMock(id=1)
    acc2 = MagicMock(id=2)
    tokens = MagicMock()

    def acquire_side_effect(*_args, exclude_ids=None, **_kwargs):
        skip = exclude_ids or frozenset()
        for acc in (acc1, acc2):
            if acc.id not in skip:
                return acc, tokens
        raise tidal_pool.NoAccountAvailable("none")

    calls = {"n": 0}

    def fetch_once(_client, track_id, enum_q):
        calls["n"] += 1
        if calls["n"] == 1:
            return None, True
        return manifest, False

    with patch.object(tidal_pool, "acquire", side_effect=acquire_side_effect):
        with patch.object(tidal_pool, "report_rate_limited") as report_rl:
            with patch(
                "tidal_dl_ru.providers.tidal.manifest_fetch._fetch_once",
                side_effect=fetch_once,
            ):
                got, limited = fetch_playback_manifest("42", AudioQuality.HIGH)
    assert got is manifest
    assert limited is False
    report_rl.assert_called_once_with(1)


def test_track_rate_limit_flag():
    manifest_cache.mark_track_rate_limited("7", ttl_sec=60)
    assert manifest_cache.is_track_rate_limited("7") is True
