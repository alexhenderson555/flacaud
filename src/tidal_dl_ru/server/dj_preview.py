"""Server-side BPM/key preview (~30s) for Pro users with DJ analysis enabled."""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import httpx

from tidal_dl_ru.core.dj import analyze_and_tag, camelot_key
from tidal_dl_ru.core.router import get_provider_by_name
from tidal_dl_ru.providers.tidal.download import (
    UnsupportedManifest,
    _decode_manifest,
    _looks_encrypted,
    _stream_urls_from_dash,
)
from tidal_dl_ru.providers.tidal.models import AudioQuality

logger = logging.getLogger(__name__)

_PREVIEW_SEC = 28
_DASH_SEGMENTS_FOR_PREVIEW = 12
_CACHE_TTL_SEC = 7 * 24 * 3600
_FAIL_COOLDOWN_SEC = 45

_meta_cache: dict[str, tuple[float, dict]] = {}
_fail_until: dict[str, float] = {}
# One preview at a time — DASH download + ffmpeg competes with playback streams.
_analysis_slots = threading.Semaphore(1)


def _cache_get(track_id: str) -> dict | None:
    row = _meta_cache.get(track_id)
    if not row:
        return None
    ts, data = row
    if time.time() - ts > _CACHE_TTL_SEC:
        _meta_cache.pop(track_id, None)
        return None
    return data


def _cache_put(track_id: str, data: dict) -> None:
    _meta_cache[track_id] = (time.time(), data)
    _fail_until.pop(track_id, None)


def _recently_failed(track_id: str) -> bool:
    until = _fail_until.get(track_id)
    if until is None:
        return False
    if time.time() >= until:
        _fail_until.pop(track_id, None)
        return False
    return True


def _mark_failed(track_id: str) -> None:
    _fail_until[track_id] = time.time() + _FAIL_COOLDOWN_SEC


def _ffmpeg_clip(src: str | Path, wav: Path, *, input_is_url: bool = False) -> bool:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-t",
        str(_PREVIEW_SEC),
    ]
    if input_is_url:
        cmd += [
            "-reconnect",
            "1",
            "-reconnect_streamed",
            "1",
            "-reconnect_delay_max",
            "5",
        ]
    cmd += ["-i", str(src), "-ac", "1", "-ar", "44100", str(wav)]
    try:
        subprocess.run(cmd, check=True, timeout=75, capture_output=True)
        return wav.is_file() and wav.stat().st_size >= 1000
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        logger.info("dj_preview: ffmpeg clip failed: %s", e)
        return False


def _download_dash_preview(urls: list[str], dest: Path) -> bool:
    """Download init + first media segments — enough for BPM/key."""
    if not urls:
        return False
    limit = min(len(urls), _DASH_SEGMENTS_FOR_PREVIEW + 1)
    try:
        timeout = httpx.Timeout(45.0, connect=12.0)
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            dest.parent.mkdir(parents=True, exist_ok=True)
            with dest.open("wb") as f:
                for url in urls[:limit]:
                    resp = client.get(url)
                    resp.raise_for_status()
                    f.write(resp.content)
        return dest.is_file() and dest.stat().st_size >= 1000
    except Exception as e:
        logger.info("dj_preview: dash segment download failed: %s", e)
        return False


def _analyze_wav(wav: Path) -> dict | None:
    result = analyze_and_tag(wav)
    bpm_raw = result.get("bpm")
    key = result.get("key")
    if not bpm_raw and not key:
        return None
    bpm = int(round(float(bpm_raw))) if bpm_raw else None
    camelot = result.get("camelot") or (camelot_key(key) if key else None)
    if not bpm or not camelot:
        return None
    return {
        "bpm": bpm,
        "musical_key": key,
        "camelot_key": camelot,
    }


def _source_from_stream_info(info: dict, track_id: str, tmp_dir: Path) -> str | Path | None:
    stype = info.get("type")

    if stype == "redirect" and info.get("url"):
        return info["url"]

    if stype == "file":
        path = Path(info.get("path") or "")
        if path.is_file():
            return path

    if stype != "dash_stream" or not info.get("manifest"):
        return None

    manifest = info["manifest"]
    try:
        decoded = _decode_manifest(manifest)
    except UnsupportedManifest as e:
        logger.info("dj_preview: unsupported manifest %s: %s", track_id, e)
        return None

    if isinstance(decoded, dict):
        urls = decoded.get("urls") or []
        return urls[0] if urls else None

    if _looks_encrypted(decoded):
        logger.info("dj_preview: encrypted dash %s", track_id)
        return None

    try:
        urls, _codecs = _stream_urls_from_dash(decoded)
    except UnsupportedManifest as e:
        logger.info("dj_preview: dash parse %s: %s", track_id, e)
        return None

    fmp4 = tmp_dir / "preview.mp4"
    if not _download_dash_preview(urls, fmp4):
        return None
    return fmp4


def _analyze_tidal_track_preview_impl(track_id: str) -> dict | None:
    if not shutil.which("ffmpeg"):
        logger.info("dj_preview: ffmpeg not found")
        return None

    provider = get_provider_by_name("tidal")
    if not provider:
        return None

    from tidal_dl_ru.server.routers.media import _resolve_tidal_stream

    qualities = [AudioQuality.HIGH, AudioQuality.LOSSLESS]

    with tempfile.TemporaryDirectory(prefix="djprev_") as tmp:
        wav = Path(tmp) / "clip.wav"

        for quality in qualities:
            try:
                info = _resolve_tidal_stream(provider, str(track_id), quality)
            except Exception as e:
                logger.info("dj_preview: stream resolve failed %s (%s): %s", track_id, quality, e)
                continue

            src = _source_from_stream_info(info, track_id, Path(tmp))
            if not src:
                logger.info("dj_preview: no preview source %s (%s, type=%s)", track_id, quality, info.get("type"))
                continue

            is_url = isinstance(src, str)
            if not _ffmpeg_clip(src, wav, input_is_url=is_url):
                continue

            out = _analyze_wav(wav)
            if out:
                return out

    return None


def analyze_tidal_track_preview(track_id: str) -> dict | None:
    tid = str(track_id).strip()
    if not tid:
        return None

    cached = _cache_get(tid)
    if cached:
        return cached

    if _recently_failed(tid):
        return None

    with _analysis_slots:
        cached = _cache_get(tid)
        if cached:
            return cached

        result = _analyze_tidal_track_preview_impl(tid)
        if result:
            _cache_put(tid, result)
            return result

        _mark_failed(tid)
        return None
