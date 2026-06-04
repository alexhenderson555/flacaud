import asyncio
import collections
import ipaddress
import logging
import socket
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

from tidal_dl_ru.core.router import get_provider_by_name
from tidal_dl_ru.database.auth import get_media_user
from tidal_dl_ru.database.models import User
from tidal_dl_ru.plan_limits import cap_stream_quality
from tidal_dl_ru.providers.tidal.download import download_track
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.files import verify_file
from tidal_dl_ru.server.range_file import ranged_file_response
from tidal_dl_ru.server.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter()


stream_locks = collections.defaultdict(asyncio.Lock)
_dash_cache_jobs: dict[str, asyncio.Task] = {}
_MIN_CACHE_BYTES = 65536
_HOP_HEADERS = frozenset(
    {
        "content-encoding",
        "transfer-encoding",
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "upgrade",
    }
)

# UI quality id -> Tidal AudioQuality probe order (highest first)
_QUALITY_PROBE = (
    (AudioQuality.HI_RES_LOSSLESS, "HI_RES"),
    (AudioQuality.LOSSLESS, "LOSSLESS"),
    (AudioQuality.HIGH, "HIGH"),
    (AudioQuality.LOW, "LOW"),
)
_UI_QUALITY_ORDER = ("LOW", "HIGH", "LOSSLESS", "HI_RES")

# Tidal manifest probe is expensive (up to 4 API calls). Cache per track briefly.
_PROBE_CACHE_TTL_SEC = 600
_PROBE_CACHE_MAX = 800
_quality_probe_cache: dict[str, tuple[float, dict]] = {}


def _probe_cache_get(track_id: str) -> dict | None:
    entry = _quality_probe_cache.get(track_id)
    if not entry:
        return None
    ts, data = entry
    if time.time() - ts > _PROBE_CACHE_TTL_SEC:
        _quality_probe_cache.pop(track_id, None)
        return None
    return data


def _probe_cache_set(track_id: str, data: dict) -> None:
    if len(_quality_probe_cache) >= _PROBE_CACHE_MAX:
        oldest = min(_quality_probe_cache, key=lambda k: _quality_probe_cache[k][0])
        _quality_probe_cache.pop(oldest, None)
    _quality_probe_cache[track_id] = (time.time(), data)


def _qname(q) -> str:
    return getattr(q, "name", str(q)).upper()


def _probe_tidal_qualities(client, track_id: str) -> dict:
    """Return available UI qualities and actual Tidal manifest quality per level."""
    available: list[str] = []
    actual: dict[str, str] = {}
    for enum_q, ui_q in _QUALITY_PROBE:
        try:
            manifest = client.get_playback_manifest(track_id, enum_q)
            if ui_q not in available:
                available.append(ui_q)
            actual[ui_q] = _qname(manifest.audio_quality)
        except Exception:
            continue
    available.sort(key=lambda q: _UI_QUALITY_ORDER.index(q) if q in _UI_QUALITY_ORDER else 0)
    max_quality = "LOW"
    for _, ui_q in _QUALITY_PROBE:
        if ui_q in available:
            max_quality = ui_q
            break
    return {
        "available": available or ["LOW"],
        "max_quality": max_quality,
        "actual": actual,
    }


async def _download_dash_segments(urls: list[str], tmp_path: Path, final_path: Path) -> None:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as dash_client:
            with tmp_path.open("wb") as cache_f:
                for url in urls:
                    async with dash_client.stream("GET", url) as seg_resp:
                        seg_resp.raise_for_status()
                        async for chunk in seg_resp.aiter_bytes(chunk_size=65536):
                            cache_f.write(chunk)
        tmp_path.replace(final_path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


async def _ensure_dash_cache(
    urls: list[str],
    tmp_path: Path,
    final_path: Path,
    min_bytes: int = _MIN_CACHE_BYTES,
) -> Path:
    if final_path.exists():
        return final_path

    key = str(final_path)
    task = _dash_cache_jobs.get(key)
    if task is None or task.done():
        _dash_cache_jobs[key] = asyncio.create_task(
            _download_dash_segments(urls, tmp_path, final_path)
        )
        task = _dash_cache_jobs[key]

    needed = max(_MIN_CACHE_BYTES, min_bytes)

    for _ in range(600):
        if final_path.exists():
            return final_path
        if tmp_path.exists() and tmp_path.stat().st_size >= needed:
            return tmp_path
        if task.done():
            if final_path.exists():
                return final_path
            err = task.exception()
            if err:
                raise err
            break
        await asyncio.sleep(0.1)

    if tmp_path.exists() and tmp_path.stat().st_size > 0:
        return tmp_path
    raise HTTPException(status_code=504, detail="Stream cache timeout")


def _range_bytes_needed(request: Request) -> int:
    rh = request.headers.get("range")
    if not rh or not rh.lower().startswith("bytes="):
        return _MIN_CACHE_BYTES
    spec = rh.split("=", 1)[1].strip().split(",", 1)[0].strip()
    if spec.startswith("-"):
        return _MIN_CACHE_BYTES
    _, _, end_s = spec.partition("-")
    if end_s:
        try:
            return max(_MIN_CACHE_BYTES, int(end_s) + 1)
        except ValueError:
            pass
    return _MIN_CACHE_BYTES


async def _proxy_bts_stream(url: str, request: Request, extra_headers: dict) -> StreamingResponse:
    req_headers: dict[str, str] = {}
    if rh := request.headers.get("range"):
        req_headers["Range"] = rh

    client = httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0))
    upstream = await client.send(client.build_request("GET", url, headers=req_headers), stream=True)

    headers = {k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_HEADERS}
    headers["Accept-Ranges"] = "bytes"
    headers["Access-Control-Allow-Origin"] = "*"
    headers["Access-Control-Expose-Headers"] = "Content-Range, Accept-Ranges, X-Actual-Quality, Content-Length"
    headers.update(extra_headers)

    async def _stream_generator():
        try:
            async for chunk in upstream.aiter_bytes(chunk_size=65536):
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    media_type = headers.get("content-type", "audio/mp4")
    return StreamingResponse(
        _stream_generator(),
        status_code=upstream.status_code,
        headers=headers,
        media_type=media_type,
    )


def _resolve_tidal_stream(p, track_id: str, q_enum: AudioQuality) -> dict:
    import base64
    import json

    with p._client() as c:
        qualities_to_try = [q_enum]
        if q_enum == getattr(AudioQuality, "HI_RES_LOSSLESS", None):
            qualities_to_try += [AudioQuality.LOSSLESS, AudioQuality.HIGH, AudioQuality.LOW]
        elif q_enum == AudioQuality.LOSSLESS:
            qualities_to_try += [AudioQuality.HIGH, AudioQuality.LOW]
        elif q_enum == AudioQuality.HIGH:
            qualities_to_try += [AudioQuality.LOW]

        dash_manifest = None
        dash_quality = None

        # Prefer direct BTS URLs (byte-range seekable CDN) over DASH chunk concat.
        for q in qualities_to_try:
            try:
                manifest = c.get_playback_manifest(track_id, q)
                if manifest.manifest_mime_type == "application/vnd.tidal.bts":
                    raw = base64.b64decode(manifest.manifest)
                    data = json.loads(raw)
                    urls = data.get("urls", [])
                    if urls:
                        return {"type": "redirect", "url": urls[0], "actual_quality": manifest.audio_quality}
                if manifest.manifest_mime_type == "application/dash+xml" and dash_manifest is None:
                    dash_manifest = manifest
                    dash_quality = manifest.audio_quality
            except Exception:
                continue

        if dash_manifest is not None:
            return {"type": "dash_stream", "manifest": dash_manifest, "actual_quality": dash_quality}

        manifest = c.get_playback_manifest(track_id, AudioQuality.LOW)
        if manifest.manifest_mime_type == "application/dash+xml":
            return {"type": "dash_stream", "manifest": manifest, "actual_quality": manifest.audio_quality}
        cache_dir = Path(tempfile.gettempdir()) / "tidal_stream_cache"
        tmp_dest = cache_dir / f"{track_id}_{AudioQuality.LOW.name}"
        final_path = download_track(c._http, manifest, tmp_dest)
        return {"type": "file", "path": final_path, "actual_quality": manifest.audio_quality}

@router.get("/api/image-proxy")
async def image_proxy(url: str):
    """Proxy remote images for the frontend (CORS). Hardened against SSRF:
    only http(s), and the host must resolve exclusively to public addresses
    (blocks loopback, RFC1918, link-local/metadata, reserved, etc.)."""

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Invalid URL")

    # Resolve the host and reject if ANY resolved address is non-public.
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(parsed.hostname, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="Cannot resolve host")
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            raise HTTPException(status_code=400, detail="Blocked address")
        if (
            ip.is_private or ip.is_loopback or ip.is_link_local
            or ip.is_reserved or ip.is_multicast or ip.is_unspecified
        ):
            raise HTTPException(status_code=400, detail="Blocked address")

    # follow_redirects stays off so a 30x can't bounce us to an internal host.
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
        r = await client.get(url)
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400"
        }
        return Response(content=r.content, media_type=r.headers.get("content-type", "image/jpeg"), headers=headers)

@router.get("/api/files/{token}")
def get_file(token: str) -> FileResponse:
    path: Path | None = verify_file(token)
    if path is None:
        raise HTTPException(status_code=404, detail="file not found or token expired")
    return FileResponse(path, filename=path.name)

@router.get("/api/lyrics")
async def get_lyrics(
    q: str | None = None,
    artist: str | None = None,
    title: str | None = None,
    album: str | None = None,
    duration: int | None = None,
    isrc: str | None = None,
    version: str | None = None,
    provider: str | None = None,
    provider_id: str | None = None,
):
    from tidal_dl_ru.core.lyrics import fetch_lyrics_lines

    resolved_artist = artist or ""
    resolved_title = title or ""
    resolved_album = album
    resolved_duration = duration
    resolved_isrc = isrc
    resolved_version = version

    if provider == "tidal" and provider_id:
        p = get_provider_by_name("tidal")
        if p:
            def _enrich():
                with p._client() as c:
                    return c.get_track(provider_id)

            try:
                tidal_track = await asyncio.wait_for(asyncio.to_thread(_enrich), timeout=10.0)
                if tidal_track.artists:
                    resolved_artist = tidal_track.artists[0].name
                elif tidal_track.artist:
                    resolved_artist = tidal_track.artist.name
                resolved_title = tidal_track.title or resolved_title
                if tidal_track.album:
                    resolved_album = tidal_track.album.title
                if tidal_track.duration:
                    resolved_duration = tidal_track.duration
                if tidal_track.isrc:
                    resolved_isrc = tidal_track.isrc
                if tidal_track.version:
                    resolved_version = tidal_track.version
            except Exception as exc:
                logger.debug("Lyrics metadata enrich failed: %s", exc)

    if not resolved_title and q:
        parts = q.strip().split(" ", 1)
        if not resolved_artist and parts:
            resolved_artist = parts[0]
        if len(parts) > 1:
            resolved_title = parts[1]
        elif parts:
            resolved_title = parts[0]

    if not resolved_title:
        raise HTTPException(status_code=400, detail="title or q required")

    def _fetch():
        return fetch_lyrics_lines(
            artist=resolved_artist,
            title=resolved_title,
            album=resolved_album,
            duration=resolved_duration,
            isrc=resolved_isrc,
            version=resolved_version,
            query=q,
        )

    try:
        lines = await asyncio.wait_for(asyncio.to_thread(_fetch), timeout=18.0)
    except asyncio.TimeoutError:
        logger.info("Lyrics lookup timed out for %s - %s", resolved_artist, resolved_title)
        lines = []
    return {"lyrics": lines}

@router.get("/api/downloads")
def get_downloads() -> dict[str, str]:
    return job_state.get_downloaded_registry()

@router.get("/api/quality/{provider}/{track_id}/available")
async def get_available_qualities(provider: str, track_id: str):
    """Probe Tidal for every quality tier; used to enable/disable the player switcher."""
    p = get_provider_by_name(provider)
    if not p:
        raise HTTPException(status_code=400, detail="Provider not found")

    if provider == "tidal":
        cached = _probe_cache_get(track_id)
        if cached is not None:
            return cached

        def _probe():
            with p._client() as c:
                return _probe_tidal_qualities(c, track_id)

        result = await asyncio.to_thread(_probe)
        _probe_cache_set(track_id, result)
        return result

    return {"available": list(_UI_QUALITY_ORDER), "max_quality": "LOSSLESS", "actual": {}}


@router.get("/api/quality/{provider}/{track_id}")
async def get_track_quality(provider: str, track_id: str, quality: str = "HI_RES"):
    p = get_provider_by_name(provider)
    if not p:
        raise HTTPException(status_code=400, detail="Provider not found")

    if provider == "tidal":
        try:
            if quality.upper() == "HI_RES":
                q_enum = getattr(AudioQuality, "HI_RES_LOSSLESS", AudioQuality.LOSSLESS)
            else:
                q_enum = AudioQuality[quality.upper()]
        except KeyError:
            q_enum = AudioQuality.LOW

        def _get_q():
            with p._client() as c:
                probe = _probe_tidal_qualities(c, track_id)
                ui = quality.upper()
                if ui in probe["actual"]:
                    return probe["actual"][ui]
                if ui == "HI_RES" and "HI_RES" in probe["available"]:
                    return probe["actual"].get("HI_RES", probe["max_quality"])
                # Fallback: best at or below requested tier
                req_idx = _UI_QUALITY_ORDER.index(ui) if ui in _UI_QUALITY_ORDER else 0
                for q in reversed(_UI_QUALITY_ORDER[: req_idx + 1]):
                    if q in probe["actual"]:
                        return probe["actual"][q]
                return probe["actual"].get(probe["max_quality"], AudioQuality.LOW.name)

        actual_q = await asyncio.to_thread(_get_q)
        return {"quality": _qname(actual_q) if not isinstance(actual_q, str) else actual_q.upper()}

    return {"quality": quality}

@router.get("/api/stream/{provider}/{track_id}")
async def stream_track(provider: str, track_id: str, request: Request, current_user: User = Depends(get_media_user), quality: str = "LOW", bypass_registry: str = "false"):
    if bypass_registry.lower() != "true":
        registry = job_state.get_downloaded_registry()
        if track_id in registry:
            full_path = settings.jobs_dir / registry[track_id]
            if full_path.exists():
                media_type = "audio/flac" if full_path.suffix.lower() == ".flac" else "audio/mp4"
                return ranged_file_response(full_path, request, media_type)

    p = get_provider_by_name(provider)
    if not p:
        raise HTTPException(status_code=400, detail="Provider not found")

    if provider == "tidal":
        quality = cap_stream_quality(quality, current_user.effective_plan)
        try:
            if quality.upper() == "HI_RES":
                q_enum = getattr(AudioQuality, "HI_RES_LOSSLESS", AudioQuality.LOSSLESS)
            else:
                q_enum = AudioQuality[quality.upper()]
        except KeyError:
            q_enum = AudioQuality.LOW

        cache_dir = Path(tempfile.gettempdir()) / "tidal_stream_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)

        lock = stream_locks[track_id]
        try:
            async with lock:
                for ext in [".m4a", ".flac", ".mp4", ".eac3"]:
                    cached_file = cache_dir / f"{track_id}_{q_enum.name}{ext}"
                    if cached_file.exists():
                        media_type = "audio/flac" if ext == ".flac" else "audio/mp4"
                        return ranged_file_response(cached_file, request, media_type)

                res = await asyncio.to_thread(_resolve_tidal_stream, p, track_id, q_enum)

            aq = res.get("actual_quality")
            quality_hdr = {"X-Actual-Quality": getattr(aq, "name", str(aq))} if aq else {}

            if res["type"] == "redirect":
                return await _proxy_bts_stream(res["url"], request, quality_hdr)

            if res["type"] == "dash_stream":
                from tidal_dl_ru.providers.tidal.download import (
                    _decode_manifest,
                    _stream_urls_from_dash,
                    extension_for,
                )

                decoded = _decode_manifest(res["manifest"])
                urls, codecs = _stream_urls_from_dash(decoded)
                ext = extension_for(codecs, res["manifest"].manifest_mime_type)
                cache_key = getattr(aq, "name", str(aq)).upper() if aq else q_enum.name
                final_path = cache_dir / f"{track_id}_{cache_key}{ext}"
                tmp_path = final_path.with_suffix(final_path.suffix + ".part")
                media_type = "audio/flac" if ext == ".flac" else "audio/mp4"

                serve_path = await _ensure_dash_cache(
                    urls, tmp_path, final_path, _range_bytes_needed(request)
                )
                return ranged_file_response(serve_path, request, media_type, quality_hdr)

            media_type = "audio/flac" if str(res["path"]).endswith(".flac") else "audio/mp4"
            return ranged_file_response(Path(res["path"]), request, media_type, quality_hdr)
        except HTTPException:
            raise
        except Exception as e:
            logger.info(f"Streaming error: {e}")
            raise HTTPException(status_code=500, detail="Internal Server Error")

    raise HTTPException(status_code=400, detail="Streaming not supported for this provider")
