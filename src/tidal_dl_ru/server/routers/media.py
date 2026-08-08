"""Media FastAPI routes: image proxy (SSRF-safe), signed file downloads, lyrics,
downloads registry, per-track quality probe, and audio streaming endpoints.

The streaming/quality pipeline internals live in ``tidal_dl_ru.server.streaming``;
this module is the thin route layer over them.
"""

import asyncio
import ipaddress
import logging
import socket
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response

from tidal_dl_ru.core.router import get_provider_by_name
from tidal_dl_ru.database.auth import get_current_user, get_media_user
from tidal_dl_ru.database.models import User
from tidal_dl_ru.plan_limits import (
    cap_stream_quality,
)
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.files import verify_file
from tidal_dl_ru.server.metrics import record_stream_error
from tidal_dl_ru.server.range_file import ranged_file_response
from tidal_dl_ru.server.streaming import (
    TidalStreamUnavailable,
    api_detail,
    bts_cache_path,
    dash_file_media_type,
    dash_stream_bytes_needed,
    delivered_stream_meta,
    ensure_bts_cache,
    ensure_dash_cache,
    find_merged_dash_file,
    quality_to_enum,
    requires_full_file_before_play,
    resolve_dash_stream_cached,
    schedule_bts_warm,
    schedule_dash_warm,
    serve_bts_progressive,
    stream_cache_dir,
)

logger = logging.getLogger(__name__)


router = APIRouter()


_UI_QUALITY_ORDER = ("HIGH", "LOSSLESS", "HI_RES")


# Tidal manifest probe is expensive (up to 4 API calls). Cache per track briefly.
_PROBE_CACHE_TTL_SEC = 600


_PROBE_RATE_LIMIT_TTL_SEC = 30


_PROBE_CACHE_MAX = 800


_quality_probe_cache: dict[str, tuple[float, dict, float]] = {}


def _probe_cache_get(track_id: str) -> dict | None:
    entry = _quality_probe_cache.get(track_id)
    if not entry:
        return None
    ts, data, ttl = entry
    if time.time() - ts > ttl:
        _quality_probe_cache.pop(track_id, None)
        return None
    return data


def _probe_cache_set(track_id: str, data: dict) -> None:
    if data.get("probe_complete") is False:
        if not data.get("rate_limited"):
            return
        ttl = _PROBE_RATE_LIMIT_TTL_SEC
    else:
        ttl = _PROBE_CACHE_TTL_SEC
    if len(_quality_probe_cache) >= _PROBE_CACHE_MAX:
        oldest = min(_quality_probe_cache, key=lambda k: _quality_probe_cache[k][0])
        _quality_probe_cache.pop(oldest, None)
    _quality_probe_cache[track_id] = (time.time(), data, ttl)


def _probe_tidal_qualities(client, track_id: str, *, manifest_client=None) -> dict:
    from tidal_dl_ru.providers.tidal.quality_probe import probe_tidal_qualities

    return probe_tidal_qualities(client, track_id, manifest_client=manifest_client)


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

    allowed_suffixes = (
        ".tidal.com",
        ".tidalcdn.com",
        ".wikimedia.org",
        ".wikipedia.org",
        ".dzcdn.net",
        ".mzstatic.com",
        # SoundCloud set-browser artwork (i1.sndcdn.com etc). Many RU ISPs
        # blackhole sndcdn's CDN ranges (collateral from broader blocking)
        # even though soundcloud.com itself loads fine, so these thumbnails
        # need to come from our own server rather than the client's browser.
        ".sndcdn.com",
    )
    host = (parsed.hostname or "").lower()
    if not (
        host.endswith(allowed_suffixes)
        or host in ("tidal.com",)
    ):
        raise HTTPException(status_code=400, detail="Host not allowed")

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True, max_redirects=5) as client:
        try:
            r = await client.get(url)
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="Upstream image fetch failed")
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail="Upstream image unavailable")
        headers = {
            # Public image proxy: SSRF-filtered, no auth, no credentials.
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400",
        }
        return Response(
            content=r.content,
            media_type=r.headers.get("content-type", "image/jpeg"),
            headers=headers,
        )


def _media_type_for_audio_path(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".flac":
        return "audio/flac"
    if ext in (".m4a", ".mp4"):
        return "audio/mp4"
    if ext == ".mp3":
        return "audio/mpeg"
    return "application/octet-stream"


@router.get("/api/files/{token}")
def get_file(token: str) -> FileResponse:
    path: Path | None = verify_file(token)
    if path is None:
        raise HTTPException(status_code=404, detail="file not found or token expired")
    return FileResponse(
        path,
        filename=path.name,
        media_type=_media_type_for_audio_path(path),
    )


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

    has_lyrics_metadata = bool(
        resolved_title.strip()
        and resolved_artist.strip()
        and (resolved_isrc or resolved_duration)
    )

    if provider == "tidal" and provider_id and not has_lyrics_metadata:
        p = get_provider_by_name("tidal")
        if p:
            def _enrich():
                with p._client() as c:
                    return c.get_track(provider_id)

            try:
                tidal_track = await asyncio.wait_for(asyncio.to_thread(_enrich), timeout=5.0)
                if tidal_track.artists:
                    resolved_artist = ", ".join(a.name for a in tidal_track.artists if a.name)
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
        lines = await asyncio.wait_for(asyncio.to_thread(_fetch), timeout=20.0)
    except asyncio.TimeoutError:
        logger.info("Lyrics lookup timed out for %s - %s", resolved_artist, resolved_title)
        lines = []
    return {"lyrics": lines}


@router.get("/api/downloads")
def get_downloads(current_user: User = Depends(get_current_user)) -> dict[str, str | dict]:
    assert current_user.id is not None
    return job_state.get_downloaded_registry_for_owner(current_user.id)


@router.get("/api/quality/{provider}/{track_id}/available")
async def get_available_qualities(
    provider: str,
    track_id: str,
    current_user: User = Depends(get_media_user),
):
    """Probe Tidal for every quality tier; used to enable/disable the player switcher."""
    p = get_provider_by_name(provider)
    if not p:
        raise HTTPException(status_code=400, detail="Provider not found")

    if provider == "tidal":
        cached = _probe_cache_get(track_id)
        if cached is not None:
            return cached

        def _probe():
            with p._client() as client:
                return _probe_tidal_qualities(client, track_id, manifest_client=client)

        result = await asyncio.to_thread(_probe)
        _probe_cache_set(track_id, result)
        return result

    return {"available": list(_UI_QUALITY_ORDER), "max_quality": "LOSSLESS", "actual": {}}


@router.get("/api/quality/{provider}/{track_id}")
async def get_track_quality(
    provider: str,
    track_id: str,
    quality: str = "HI_RES",
    current_user: User = Depends(get_media_user),
):
    p = get_provider_by_name(provider)
    if not p:
        raise HTTPException(status_code=400, detail="Provider not found")

    if provider == "tidal":
        ui = cap_stream_quality(quality, current_user.effective_plan)

        def _get_meta():
            with p._client() as client:
                return delivered_stream_meta(
                    track_id, ui, current_user.effective_plan, client=client,
                )

        meta = await asyncio.to_thread(_get_meta)
        return meta

    return {"quality": quality, "sample_rate": None, "bit_depth": None}


@router.get("/api/stream/{provider}/{track_id}/ready")
async def stream_track_ready(
    provider: str,
    track_id: str,
    current_user: User = Depends(get_media_user),
    quality: str = "LOSSLESS",
    bypass_registry: str = "false",
):
    """Lightweight poll — merged cache exists. Kicks warm on miss (for clients that use this)."""
    if bypass_registry.lower() != "true":
        assert current_user.id is not None
        registry = job_state.get_downloaded_registry_for_owner(current_user.id)
        reg_file = job_state.registry_file_for_quality(registry, track_id, quality)
        if reg_file is not None:
            return {"ready": True, "source": "registry"}

    if provider != "tidal":
        return {"ready": False}

    quality = cap_stream_quality(quality, current_user.effective_plan)
    q_enum = quality_to_enum(quality)
    cache_dir = stream_cache_dir()
    merged = find_merged_dash_file(cache_dir, track_id, q_enum)
    if merged is not None:
        return {"ready": True, "source": "cache", "bytes": merged.stat().st_size}

    # Passive poll must still start the merge — otherwise clients spin forever.
    await warm_stream_track(provider, track_id, current_user, quality)
    return {"ready": False}


@router.post("/api/stream/{provider}/{track_id}/warm")
async def warm_stream_track(
    provider: str,
    track_id: str,
    current_user: User = Depends(get_media_user),
    quality: str = "LOSSLESS",
):
    """Begin DASH cache fill before playback (lossless only — BTS needs no warm)."""
    p = get_provider_by_name(provider)
    if not p:
        raise HTTPException(status_code=400, detail="Provider not found")
    if provider != "tidal":
        return {"status": "noop", "mode": "unsupported"}

    quality = cap_stream_quality(quality, current_user.effective_plan)
    q_enum = quality_to_enum(quality)
    cache_dir = stream_cache_dir()

    try:
        dash = await resolve_dash_stream_cached(
            p, track_id, q_enum, cache_dir, current_user.effective_plan,
        )
    except Exception as exc:
        logger.debug("warm resolve failed track=%s: %s", track_id, exc)
        return {"status": "unavailable"}

    res = dash["res"]
    if res["type"] == "redirect":
        cache_path = bts_cache_path(cache_dir, track_id, q_enum, res["url"])
        schedule_bts_warm(res["url"], cache_path)
        if requires_full_file_before_play(q_enum):
            return {"status": "warming", "mode": "bts_cache"}
        return {"status": "warming", "mode": "bts_progressive"}
    if res["type"] != "dash_stream":
        return {"status": "noop", "mode": res["type"]}

    schedule_dash_warm(
        dash["urls"], dash["tmp_path"], dash["fmp4_path"], dash["final_path"],
    )
    return {"status": "warming", "mode": "dash_stream"}


@router.get("/api/stream/{provider}/{track_id}")
async def stream_track(provider: str, track_id: str, request: Request, current_user: User = Depends(get_media_user), quality: str = "HIGH", bypass_registry: str = "false"):
    if bypass_registry.lower() != "true":
        assert current_user.id is not None
        registry = job_state.get_downloaded_registry_for_owner(current_user.id)
        reg_file = job_state.registry_file_for_quality(registry, track_id, quality)
        if reg_file is not None:
            media_type = "audio/flac" if reg_file.suffix.lower() == ".flac" else "audio/mp4"
            return ranged_file_response(reg_file, request, media_type)

    p = get_provider_by_name(provider)
    if not p:
        raise HTTPException(status_code=400, detail="Provider not found")

    if provider == "tidal":
        quality = cap_stream_quality(quality, current_user.effective_plan)
        q_enum = quality_to_enum(quality)

        cache_dir = stream_cache_dir()

        try:
            merged = find_merged_dash_file(cache_dir, track_id, q_enum)
            if merged is not None:
                return ranged_file_response(
                    merged, request, dash_file_media_type(merged),
                )

            dash = await resolve_dash_stream_cached(
                p, track_id, q_enum, cache_dir, current_user.effective_plan,
            )
            res = dash["res"]
            aq = dash.get("actual_quality") or res.get("actual_quality")
            quality_hdr = {"X-Actual-Quality": getattr(aq, "name", str(aq))} if aq else {}
            manifest = res.get("manifest") if res.get("type") == "dash_stream" else None
            if manifest is not None and manifest.sample_rate:
                quality_hdr["X-Sample-Rate"] = str(manifest.sample_rate)
            if manifest is not None and manifest.bit_depth:
                quality_hdr["X-Bit-Depth"] = str(manifest.bit_depth)

            stream_mode = res["type"]
            quality_hdr["X-Stream-Mode"] = stream_mode
            segments = len(dash["urls"]) if stream_mode == "dash_stream" and dash.get("urls") else None
            logger.info(
                "stream track=%s quality=%s mode=%s segments=%s user_plan=%s",
                track_id,
                quality,
                stream_mode,
                segments,
                current_user.effective_plan,
            )

            if res["type"] == "redirect":
                if requires_full_file_before_play(q_enum):
                    cache_path = bts_cache_path(cache_dir, track_id, q_enum, res["url"])
                    serve_path = await ensure_bts_cache(res["url"], cache_path)
                    logger.info(
                        "bts_cache track=%s bytes=%s",
                        track_id,
                        serve_path.stat().st_size if serve_path.is_file() else None,
                    )
                    return ranged_file_response(
                        serve_path,
                        request,
                        dash_file_media_type(serve_path),
                        quality_hdr,
                    )
                return await serve_bts_progressive(
                    res["url"],
                    bts_cache_path(cache_dir, track_id, q_enum, res["url"]),
                    request,
                    quality_hdr,
                    track_id=track_id,
                )

            if res["type"] == "dash_stream":
                urls = dash["urls"]
                tmp_path = dash["tmp_path"]
                fmp4_path = dash["fmp4_path"]
                final_path = dash["final_path"]
                file_media_type = dash["file_media_type"]

                serve_path = await ensure_dash_cache(
                    urls,
                    tmp_path,
                    fmp4_path,
                    final_path,
                    dash_stream_bytes_needed(request),
                )
                if not serve_path.is_file() or serve_path in (tmp_path, fmp4_path):
                    record_stream_error("not_ready")
                    raise HTTPException(
                        status_code=503,
                        detail=api_detail("stream_not_ready", "Stream not ready"),
                    )
                return ranged_file_response(
                    serve_path,
                    request,
                    dash_file_media_type(serve_path),
                    quality_hdr,
                )

            media_type = "audio/flac" if str(res["path"]).endswith(".flac") else "audio/mp4"
            return ranged_file_response(Path(res["path"]), request, media_type, quality_hdr)
        except HTTPException:
            raise
        except TidalStreamUnavailable as e:
            logger.info("Streaming error: %s", e)
            record_stream_error("rate_limited" if e.rate_limited else "failed")
            if e.rate_limited:
                raise HTTPException(
                    status_code=503,
                    detail=api_detail(
                        "tidal_rate_limited",
                        "Tidal is rate limiting playback — retry in a few seconds",
                    ),
                    headers={"Retry-After": "2"},
                ) from e
            raise HTTPException(
                status_code=503,
                detail=api_detail("stream_failed", "Could not prepare stream"),
            ) from e
        except Exception as e:
            logger.info(f"Streaming error: {e}")
            record_stream_error("failed")
            raise HTTPException(
                status_code=503,
                detail=api_detail("stream_failed", "Could not prepare stream"),
            ) from e

    raise HTTPException(status_code=400, detail="Streaming not supported for this provider")
