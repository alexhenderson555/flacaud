"""Fetch Tidal playback manifests with cache + pool rotation on 429."""

from __future__ import annotations

import time

import httpx

from tidal_dl_ru.providers.tidal import manifest_cache
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import AudioQuality, PlaybackManifest

_MAX_POOL_ATTEMPTS = 4
_RETRY_SLEEP_SEC = 0.35


def _fetch_once(client: TidalClient, track_id: str, enum_q: AudioQuality) -> tuple[PlaybackManifest | None, bool]:
    """Single client attempt with brief 429 retry. Returns (manifest, rate_limited)."""
    for attempt in range(2):
        try:
            return client.get_playback_manifest(track_id, enum_q), False
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                if attempt == 0:
                    time.sleep(_RETRY_SLEEP_SEC)
                    continue
                return None, True
            return None, False
        except Exception:
            return None, False
    return None, True


def fetch_playback_manifest(
    track_id: str,
    enum_q: AudioQuality,
    *,
    client: TidalClient | None = None,
) -> tuple[PlaybackManifest | None, bool]:
    """Cached manifest fetch. Rotates pool accounts on 429 when client is omitted."""
    q_name = enum_q.name
    cached = manifest_cache.get(track_id, q_name)
    if cached is not None:
        return cached, False

    if client is not None:
        manifest, rate_limited = _fetch_once(client, track_id, enum_q)
        if manifest is not None:
            manifest_cache.put(track_id, q_name, manifest)
        if rate_limited:
            manifest_cache.mark_track_rate_limited(track_id)
        return manifest, rate_limited

    excluded: frozenset[int] = frozenset()
    saw_rate_limit = False
    for _ in range(_MAX_POOL_ATTEMPTS):
        try:
            acc, tokens = tidal_pool.acquire(exclude_ids=excluded)
        except tidal_pool.NoAccountAvailable:
            break

        own_http = httpx.Client(timeout=30.0)
        try:
            rotating = TidalClient(
                http=own_http,
                tokens=tokens,
                on_auth_error=lambda status, _id=acc.id: tidal_pool.report_failure(_id, status),
            )
            manifest, rate_limited = _fetch_once(rotating, track_id, enum_q)
        finally:
            own_http.close()

        if manifest is not None:
            manifest_cache.put(track_id, q_name, manifest)
            return manifest, False

        if rate_limited:
            saw_rate_limit = True
            tidal_pool.report_rate_limited(acc.id)
            manifest_cache.mark_track_rate_limited(track_id)
            excluded = excluded | {acc.id}
            continue

        return None, False

    return None, saw_rate_limit
