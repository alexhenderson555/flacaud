from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Depends
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse
import asyncio
import collections
import httpx
import ipaddress
import json
import logging
import os
import random
import socket
import syncedlyrics
import tempfile

from tidal_dl_ru.server.schemas import SearchResponse, ProviderInfo, SearchRequest, PoolHealth
from tidal_dl_ru.core.router import all_providers, get_provider_by_name
from tidal_dl_ru.core.models import Track
from tidal_dl_ru.core.recognize import recognize_audio
from tidal_dl_ru.database.auth import get_current_user, get_media_user
from tidal_dl_ru.database.models import User
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.auth import (
    extract_code_from_url, pkce_exchange_code, save_tokens, AuthError,
    load_tokens, pkce_login_url,
)
from tidal_dl_ru.providers.tidal.client import TidalClient, cover_url
from tidal_dl_ru.providers.tidal.download import download_track
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.providers.tidal.provider import _to_universal
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.files import verify_file
from tidal_dl_ru.server.payments import create_payment, process_webhook
from tidal_dl_ru.server.settings import settings
from tidal_dl_ru.bot.users import Plan

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
async def get_lyrics(q: str):
    
    def _fetch():
        return syncedlyrics.search(q, providers=["Lrclib", "Musixmatch"])
        
    lrc = await asyncio.to_thread(_fetch)
    if not lrc:
        return {"lyrics": []}
        
    lines = []
    for line in lrc.split('\n'):
        if line.startswith('[') and ']' in line:
            time_str = line[1:line.find(']')]
            text = line[line.find(']')+1:].strip()
            try:
                m, s = time_str.split(':')
                seconds = int(m) * 60 + float(s)
                if text:
                    lines.append({"time": seconds, "text": text})
            except Exception:
                pass
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
        return {"quality": actual_q}
        
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
                            except Exception as e:
                                continue
                        
                        # If we absolutely exhausted everything and it's ONLY DASH
                        manifest = c.get_playback_manifest(track_id, AudioQuality.LOW)
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
                from tidal_dl_ru.providers.tidal.download import _decode_manifest, _stream_urls_from_dash, extension_for
                decoded = _decode_manifest(res["manifest"])
                urls, codecs = _stream_urls_from_dash(decoded)
                
                ext = extension_for(codecs, res["manifest"].manifest_mime_type)
                final_path = cache_dir / f"{track_id}_{quality.upper()}{ext}"
                
                if not final_path.exists():
                    async def fetch_segment(client, url, idx):
                        resp = await client.get(url)
                        resp.raise_for_status()
                        return idx, resp.content
                        
                    async with httpx.AsyncClient() as async_client:
                        sem = asyncio.Semaphore(15)
                        async def bounded_fetch(idx, u):
                            async with sem:
                                return await fetch_segment(async_client, u, idx)
                                
                        tasks = [bounded_fetch(i, u) for i, u in enumerate(urls)]
                        results = await asyncio.gather(*tasks)
                        
                        results.sort(key=lambda x: x[0])
                        def write_file():
                            with open(final_path, 'wb') as f:
                                for _, chunk in results:
                                    f.write(chunk)
                        await asyncio.to_thread(write_file)
                        
                media_type = "audio/flac" if ext == ".flac" else "audio/mp4"
                hdrs = {"Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Actual-Quality"}
                if "actual_quality" in res:
                    hdrs["X-Actual-Quality"] = res["actual_quality"]
                return FileResponse(final_path, headers=hdrs, media_type=media_type)
                
            media_type = "audio/flac" if str(res["path"]).endswith(".flac") else "audio/mp4"
            hdrs = {"Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Actual-Quality"}
            if "actual_quality" in res:
                hdrs["X-Actual-Quality"] = res["actual_quality"]
            return FileResponse(res["path"], headers=hdrs, media_type=media_type)
        except Exception as e:
            logger.info(f"Streaming error: {e}")
            raise HTTPException(status_code=500, detail="Internal Server Error")

            
    raise HTTPException(status_code=400, detail="Streaming not supported for this provider")
