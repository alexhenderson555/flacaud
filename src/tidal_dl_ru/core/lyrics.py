from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from pathlib import Path
from typing import Optional

import httpx
import syncedlyrics

from tidal_dl_ru.core.models import Track

logger = logging.getLogger(__name__)

LRCLIB_BASE = "https://lrclib.net/api"
_LRC_CACHE: dict[str, tuple[float, Optional[str]]] = {}
_CACHE_TTL_S = 3600
_SYNCED_TIMEOUT_S = 8.0


def _cache_key(
    *,
    artist: str,
    title: str,
    album: Optional[str],
    duration: Optional[int],
    isrc: Optional[str],
) -> str:
    if isrc:
        return f"isrc:{isrc.upper()}"
    return "|".join(
        [
            artist.strip().lower(),
            title.strip().lower(),
            (album or "").strip().lower(),
            str(duration or ""),
        ]
    )


def display_title(title: str, version: Optional[str] = None) -> str:
    if not version:
        return title
    v = version.strip()
    if not v or v.lower() in title.lower():
        return title
    return f"{title} ({v})"


def parse_lrc_lines(lrc: str) -> list[dict]:
    lines: list[dict] = []
    for line in lrc.split("\n"):
        if not line.startswith("[") or "]" not in line:
            continue
        time_str = line[1 : line.find("]")]
        text = line[line.find("]") + 1 :].strip()
        if not text:
            continue
        try:
            if ":" not in time_str:
                continue
            parts = time_str.split(":")
            if len(parts) == 3:
                seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
            else:
                m, s = parts[0], parts[1]
                seconds = int(m) * 60 + float(s)
            lines.append({"time": seconds, "text": text})
        except (ValueError, TypeError):
            continue
    return lines


def _get_cached(key: str) -> Optional[str]:
    hit = _LRC_CACHE.get(key)
    if not hit:
        return None
    ts, lrc = hit
    if time.monotonic() - ts > _CACHE_TTL_S:
        _LRC_CACHE.pop(key, None)
        return None
    return lrc


def _set_cached(key: str, lrc: Optional[str]) -> None:
    _LRC_CACHE[key] = (time.monotonic(), lrc)


def _lrclib_synced(client: httpx.Client, path: str, params: dict | None = None) -> Optional[str]:
    try:
        r = client.get(f"{LRCLIB_BASE}/{path}", params=params, timeout=10.0)
        if r.status_code != 200:
            return None
        data = r.json()
        synced = data.get("syncedLyrics")
        return synced or None
    except Exception as exc:
        logger.debug("LRCLIB lookup failed (%s): %s", path, exc)
        return None


def _syncedlyrics_search(query: str, providers: list[str]) -> Optional[str]:
    def _run() -> Optional[str]:
        return syncedlyrics.search(query, synced_only=True, providers=providers)

    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_run)
            return future.result(timeout=_SYNCED_TIMEOUT_S)
    except (FuturesTimeout, Exception) as exc:
        logger.debug("syncedlyrics timeout/error for %r: %s", query, exc)
        return None


def fetch_synced_lrc_text(
    *,
    artist: str,
    title: str,
    album: Optional[str] = None,
    duration: Optional[int] = None,
    isrc: Optional[str] = None,
    version: Optional[str] = None,
    providers: Optional[list[str]] = None,
) -> Optional[str]:
    """Return synced LRC text for a track, or None if not found."""
    track_title = display_title(title, version)
    key = _cache_key(artist=artist, title=track_title, album=album, duration=duration, isrc=isrc)
    cached = _get_cached(key)
    if cached is not None:
        return cached or None

    lrc: Optional[str] = None
    with httpx.Client() as client:
        if isrc:
            lrc = _lrclib_synced(client, f"get/isrc/{isrc.strip()}")

        if not lrc and artist and track_title:
            params: dict = {"artist_name": artist, "track_name": track_title}
            if album:
                params["album_name"] = album
            if duration:
                params["duration"] = int(duration)
            lrc = _lrclib_synced(client, "get", params)

    if not lrc:
        query = f"{artist} {track_title}"
        if album:
            query += f" {album}"
        lrc = _syncedlyrics_search(
            query,
            providers or ["Lrclib", "NetEase", "Musixmatch"],
        )

    _set_cached(key, lrc or "")
    return lrc or None


def fetch_synced_lrc(track: Track, providers: Optional[list[str]] = None) -> Optional[str]:
    """Return synced LRC text for a Track model (downloads / tagging)."""
    return fetch_synced_lrc_text(
        artist=track.primary_artist,
        title=track.title,
        album=track.album,
        duration=track.duration_s,
        isrc=track.isrc,
        version=track.version,
        providers=providers,
    )


def fetch_lyrics_lines(
    *,
    artist: str,
    title: str,
    album: Optional[str] = None,
    duration: Optional[int] = None,
    isrc: Optional[str] = None,
    version: Optional[str] = None,
    query: Optional[str] = None,
) -> list[dict]:
    """Return parsed lyric lines for the player UI."""
    lrc = fetch_synced_lrc_text(
        artist=artist,
        title=title,
        album=album,
        duration=duration,
        isrc=isrc,
        version=version,
    )
    if not lrc and query:
        lrc = _syncedlyrics_search(query, ["Lrclib", "Musixmatch"])
    if not lrc:
        return []
    return parse_lrc_lines(lrc)


def write_sidecar(lrc_text: str, audio_path: Path) -> Path:
    """Write `.lrc` sidecar next to the audio file. Return the sidecar path."""
    sidecar = audio_path.with_suffix(".lrc")
    sidecar.write_text(lrc_text, encoding="utf-8")
    return sidecar
