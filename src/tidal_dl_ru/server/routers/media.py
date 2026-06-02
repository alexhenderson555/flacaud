import asyncio
import collections
import ipaddress
import logging
import socket
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

from tidal_dl_ru.core.router import get_provider_by_name
from tidal_dl_ru.database.auth import get_media_user
from tidal_dl_ru.database.models import User
from tidal_dl_ru.providers.tidal.download import download_track
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.files import verify_file
from tidal_dl_ru.server.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter()


stream_locks = collections.defaultdict(asyncio.Lock)

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
                qualities_to_try = [q_enum]
                if q_enum == getattr(AudioQuality, "HI_RES_LOSSLESS", None):
                    qualities_to_try += [AudioQuality.LOSSLESS, AudioQuality.HIGH, AudioQuality.LOW]
                elif q_enum == AudioQuality.LOSSLESS:
                    qualities_to_try += [AudioQuality.HIGH, AudioQuality.LOW]
                elif q_enum == AudioQuality.HIGH:
                    qualities_to_try += [AudioQuality.LOW]

                for q in qualities_to_try:
                    try:
                        manifest = c.get_playback_manifest(track_id, q)
                        return manifest.audio_quality
                    except Exception:
                        continue
                return AudioQuality.LOW.name

        actual_q = await asyncio.to_thread(_get_q)
        qname = getattr(actual_q, "name", str(actual_q))
        return {"quality": qname}

    return {"quality": quality}

@router.get("/api/stream/{provider}/{track_id}")
async def stream_track(provider: str, track_id: str, request: Request, current_user: User = Depends(get_media_user), quality: str = "LOW", bypass_registry: str = "false"):
    if bypass_registry.lower() != "true":
        registry = job_state.get_downloaded_registry()
        if track_id in registry:
            full_path = settings.jobs_dir / registry[track_id]
            if full_path.exists():
                media_type = "audio/flac" if full_path.suffix.lower() == ".flac" else "audio/mp4"
                return FileResponse(full_path, headers={"Access-Control-Allow-Origin": "*"}, media_type=media_type)

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

        cache_dir = Path(tempfile.gettempdir()) / "tidal_stream_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)

        lock = stream_locks[track_id]
        try:
            async with lock:
                # Look for existing cached file
                for ext in [".m4a", ".flac", ".mp4", ".eac3"]:
                    cached_file = cache_dir / f"{track_id}_{q_enum.name}{ext}"
                    if cached_file.exists():
                        media_type = "audio/flac" if ext == ".flac" else "audio/mp4"
                        return FileResponse(cached_file, headers={"Access-Control-Allow-Origin": "*"}, media_type=media_type)

                def _dl():
                    with p._client() as c:
                        manifest = c.get_playback_manifest(track_id, q_enum)

                        # Fallback sequence to guarantee a BTS (direct URL) manifest for instant streaming
                        qualities_to_try = [q_enum]
                        if q_enum == getattr(AudioQuality, "HI_RES_LOSSLESS", None):
                            qualities_to_try += [AudioQuality.LOSSLESS, AudioQuality.HIGH, AudioQuality.LOW]
                        elif q_enum == AudioQuality.LOSSLESS:
                            qualities_to_try += [AudioQuality.HIGH, AudioQuality.LOW]
                        elif q_enum == AudioQuality.HIGH:
                            qualities_to_try += [AudioQuality.LOW]

                        import base64
                        import json

                        # We aggressively look for 'application/vnd.tidal.bts' which gives direct URLs.
                        for q in qualities_to_try:
                            try:
                                manifest = c.get_playback_manifest(track_id, q)
                                if manifest.manifest_mime_type == "application/vnd.tidal.bts":
                                    raw = base64.b64decode(manifest.manifest)
                                    data = json.loads(raw)
                                    urls = data.get("urls", [])
                                    if urls:
                                        return {"type": "redirect", "url": urls[0], "actual_quality": manifest.audio_quality}
                                elif manifest.manifest_mime_type == "application/dash+xml":
                                    return {"type": "dash_stream", "manifest": manifest, "actual_quality": manifest.audio_quality}
                            except Exception:
                                continue

                        # If we absolutely exhausted everything, try LOW as DASH stream (not full download).
                        manifest = c.get_playback_manifest(track_id, AudioQuality.LOW)
                        if manifest.manifest_mime_type == "application/dash+xml":
                            return {"type": "dash_stream", "manifest": manifest, "actual_quality": manifest.audio_quality}
                        tmp_dest = cache_dir / f"{track_id}_{AudioQuality.LOW.name}"
                        final_path = download_track(c._http, manifest, tmp_dest)
                        return {"type": "file", "path": final_path, "actual_quality": manifest.audio_quality}

                res = await asyncio.to_thread(_dl)

            if res["type"] == "redirect":
                # We must proxy the stream to bypass CORS for Web Audio API (AudioContext)
                req_headers = {}
                if "range" in request.headers:
                    req_headers["range"] = request.headers["range"]

                client = httpx.AsyncClient()
                r = await client.send(client.build_request("GET", res["url"], headers=req_headers), stream=True)

                # Pass through response headers, but remove hop-by-hop and encoding headers
                headers = dict(r.headers)
                for k in ["content-encoding", "transfer-encoding", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "upgrade"]:
                    headers.pop(k, None)

                headers["Accept-Ranges"] = "bytes"
                headers["Access-Control-Allow-Origin"] = "*"
                headers["Access-Control-Expose-Headers"] = "X-Actual-Quality"
                if "actual_quality" in res:
                    headers["X-Actual-Quality"] = res["actual_quality"]

                async def _stream_generator():
                    async for chunk in r.aiter_bytes(chunk_size=65536):
                        yield chunk
                    await client.aclose()

                return StreamingResponse(
                    _stream_generator(),
                    status_code=r.status_code,
                    headers=headers,
                    media_type=headers.get("content-type", "audio/mp4")
                )

            elif res["type"] == "dash_stream":
                from tidal_dl_ru.providers.tidal.download import (
                    _decode_manifest,
                    _stream_urls_from_dash,
                    extension_for,
                )
                decoded = _decode_manifest(res["manifest"])
                urls, codecs = _stream_urls_from_dash(decoded)

                ext = extension_for(codecs, res["manifest"].manifest_mime_type)
                actual_q = res.get("actual_quality", quality.upper())
                cache_key = getattr(actual_q, "name", str(actual_q)).upper()
                final_path = cache_dir / f"{track_id}_{cache_key}{ext}"

                hdrs = {
                    "Accept-Ranges": "bytes",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Expose-Headers": "X-Actual-Quality",
                    "Cache-Control": "no-store",
                }
                if "actual_quality" in res:
                    aq = res["actual_quality"]
                    hdrs["X-Actual-Quality"] = getattr(aq, "name", str(aq))

                if final_path.exists():
                    media_type = "audio/flac" if ext == ".flac" else "audio/mp4"
                    return FileResponse(final_path, headers=hdrs, media_type=media_type)

                tmp_path = final_path.with_suffix(final_path.suffix + ".part")

                async def _dash_stream_generator():
                    try:
                        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=15.0)) as dash_client:
                            with tmp_path.open("wb") as cache_f:
                                for url in urls:
                                    async with dash_client.stream("GET", url) as seg_resp:
                                        seg_resp.raise_for_status()
                                        async for chunk in seg_resp.aiter_bytes(chunk_size=65536):
                                            cache_f.write(chunk)
                                            yield chunk
                        tmp_path.replace(final_path)
                    except Exception:
                        tmp_path.unlink(missing_ok=True)
                        raise

                media_type = "audio/flac" if ext == ".flac" else "audio/mp4"
                return StreamingResponse(
                    _dash_stream_generator(),
                    status_code=200,
                    headers=hdrs,
                    media_type=media_type,
                )

            media_type = "audio/flac" if str(res["path"]).endswith(".flac") else "audio/mp4"
            hdrs = {"Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Actual-Quality"}
            if "actual_quality" in res:
                hdrs["X-Actual-Quality"] = res["actual_quality"]
            return FileResponse(res["path"], headers=hdrs, media_type=media_type)
        except Exception as e:
            logger.info(f"Streaming error: {e}")
            raise HTTPException(status_code=500, detail="Internal Server Error")


    raise HTTPException(status_code=400, detail="Streaming not supported for this provider")
