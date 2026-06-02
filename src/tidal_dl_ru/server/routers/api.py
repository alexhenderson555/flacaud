from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Depends
from fastapi.responses import FileResponse, StreamingResponse, Response
from tidal_dl_ru.server.schemas import SearchResponse, ProviderInfo, SearchRequest, PoolHealth
from tidal_dl_ru.core.router import all_providers, get_provider_by_name
from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.models import User
import logging

from fastapi import HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pathlib import Path
from tidal_dl_ru.bot.users import Plan
from tidal_dl_ru.core.models import Track
from tidal_dl_ru.core.recognize import recognize_audio
from tidal_dl_ru.core.router import get_provider_by_name
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.auth import extract_code_from_url, pkce_exchange_code, save_tokens, AuthError
from tidal_dl_ru.providers.tidal.auth import load_tokens
from tidal_dl_ru.providers.tidal.auth import pkce_login_url
from tidal_dl_ru.providers.tidal.client import TidalClient, cover_url
from tidal_dl_ru.providers.tidal.download import download_track
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.providers.tidal.provider import _to_universal
from tidal_dl_ru.server.payments import create_payment
from tidal_dl_ru.server.settings import settings
from typing import Optional
from urllib.parse import urlparse
import asyncio
import httpx
import ipaddress
import json
import os
import random
import socket
import syncedlyrics
import tempfile
logger = logging.getLogger(__name__)
router = APIRouter()
@router.get("/api/providers", response_model=list[ProviderInfo])
def providers() -> list[ProviderInfo]:
    return [ProviderInfo(name=p.name, display_name=p.display_name) for p in all_providers()]


@router.post("/api/search", response_model=SearchResponse)
async def search(req: SearchRequest) -> SearchResponse:
    p = get_provider_by_name(req.provider)
    if p is None:
        raise HTTPException(status_code=400, detail=f"unknown provider: {req.provider}")

    try:
        tracks = await asyncio.to_thread(p.search, req.query, req.limit)
        return SearchResponse(tracks=tracks)
    except Exception as e:
        logger.info(f"Tidal search failed: {e}")
        raise HTTPException(status_code=401, detail="Search failed")


@router.post("/api/recognize", response_model=SearchResponse)
async def recognize_endpoint(file: UploadFile = File(...)):

    audio_bytes = await file.read()
    res = await recognize_audio(audio_bytes, file.content_type)
    
    if not res:
        return SearchResponse(tracks=[])
        
    p = get_provider_by_name("tidal")
    if p:
        query = f"{res.artist} {res.title}"
        try:
            tracks = await asyncio.to_thread(p.search, query, 5)
            return SearchResponse(tracks=tracks)
        except Exception as e:
            logger.info(f"Tidal search failed: {e}")
            raise HTTPException(status_code=401, detail="Search failed")
        
    return SearchResponse(tracks=[])


@router.get("/api/artist/{artist_id}")
async def get_artist_api(artist_id: str):

    try:
        http = httpx.Client(timeout=30.0)
        try:
            acc, tokens = tidal_pool.acquire(http)
            client = TidalClient(http=http, tokens=tokens)
        except tidal_pool.NoAccountAvailable:
            client = TidalClient(http=http)

        artist = await asyncio.to_thread(client.get_artist, artist_id)
        albums = await asyncio.to_thread(client.get_artist_albums, artist_id)
        top_tracks = await asyncio.to_thread(client.get_artist_top_tracks, artist_id)
        
        artist_dict = artist.model_dump()
        if artist.picture:
            artist_dict["picture_url"] = cover_url(artist.picture, size=640)
        
        albums_list = []
        for a in albums:
            ad = a.model_dump()
            ad["cover_url"] = cover_url(a.cover, size=640) if a.cover else None
            albums_list.append(ad)

        tracks_univ = [_to_universal(t).model_dump() for t in top_tracks]
        
        return {
            "artist": artist_dict,
            "albums": albums_list,
            "top_tracks": tracks_univ
        }
    except Exception as e:
        logger.info(f"Error fetching artist {artist_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.get("/api/album/{album_id}")
async def get_album_api(album_id: str):

    try:
        http = httpx.Client(timeout=30.0)
        try:
            acc, tokens = tidal_pool.acquire(http)
            client = TidalClient(http=http, tokens=tokens)
        except tidal_pool.NoAccountAvailable:
            client = TidalClient(http=http)

        album = await asyncio.to_thread(client.get_album, album_id)
        tracks = await asyncio.to_thread(client.get_album_tracks, album_id)
        
        album_dict = album.model_dump()
        album_dict["cover_url"] = cover_url(album.cover, size=640) if album.cover else None
        
        # When getting album tracks, Tidal API sometimes omits the album info on each track.
        # We need to manually patch it before passing to _to_universal
        tracks_univ = []
        for t in tracks:
            t.album = album
            tracks_univ.append(_to_universal(t).model_dump())
            
        return {
            "album": album_dict,
            "tracks": tracks_univ
        }
    except Exception as e:
        logger.info(f"Error fetching album {album_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

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


@router.post("/api/webhooks/yookassa")
async def yookassa_webhook(request: Request) -> dict:
    """YooKassa sends payment.succeeded notifications here."""
    client_ip = request.client.host if request.client else ""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
        
    allowed_subnets = [
        ipaddress.ip_network("185.71.76.0/27"),
        ipaddress.ip_network("185.71.77.0/27"),
        ipaddress.ip_network("77.75.153.0/25"),
        ipaddress.ip_network("77.75.156.11/32"),
        ipaddress.ip_network("77.75.156.35/32"),
        ipaddress.ip_network("77.75.154.128/25"),
        ipaddress.ip_network("2a02:5180::/32")
    ]
    try:
        ip_obj = ipaddress.ip_address(client_ip)
        if not any(ip_obj in subnet for subnet in allowed_subnets):
            # Accept locally for testing only
            if str(ip_obj) not in ("127.0.0.1", "::1"):
                raise HTTPException(status_code=403, detail="Invalid IP")
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid IP format")

    body = await request.json()
    ok = process_webhook(body)
    return {"ok": ok}

from pydantic import BaseModel
class PaymentCreateRequest(BaseModel):
    plan: str

@router.post("/api/payments/create")
async def api_create_payment(req: PaymentCreateRequest, current_user: User = Depends(get_current_user)):
    
    try:
        plan_enum = Plan(req.plan.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan")
        
    if not current_user.telegram_id:
        raise HTTPException(status_code=400, detail="Telegram account not linked")
    url = create_payment(current_user.telegram_id, plan_enum, return_url="http://localhost:5173/account")
    
    if not url:
        raise HTTPException(status_code=501, detail="YooKassa integration is not yet fully configured")
        
    return {"url": url}

@router.get("/api/pool/health", response_model=PoolHealth)
def pool_health() -> PoolHealth:
    c = tidal_pool.pool_size()
    return PoolHealth(
        total=c["total"],
        active=c.get("active", 0),
        banned=c.get("banned", 0),
        exhausted=c.get("exhausted", 0),
    )


@router.get("/api/auth/status")
def auth_status():
    t = load_tokens()
    if t and t.access_token:
        return {"logged_in": True, "user_id": t.user_id, "country": t.country_code}
    return {"logged_in": False}


@router.get("/api/auth/login")
def auth_login_url():
    url, verifier = pkce_login_url()
    return {"url": url, "verifier": verifier}


from pydantic import BaseModel
class AuthCallback(BaseModel):
    redirect_url: str
    verifier: str

@router.post("/api/auth/callback")
def auth_callback(req: AuthCallback):
    
    try:
        code = extract_code_from_url(req.redirect_url)
        with httpx.Client() as c:
            tokens = pkce_exchange_code(c, code, req.verifier)
            save_tokens(tokens)
        return {"ok": True}
    except AuthError as e:
        raise HTTPException(status_code=400, detail="Internal Server Error")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.get("/api/downloads")
def get_downloads() -> dict[str, str]:
    return job_state.get_downloaded_registry()


import collections
import asyncio
stream_locks = collections.defaultdict(asyncio.Lock)

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
async def stream_track(provider: str, track_id: str, request: Request, current_user: User = Depends(get_current_user), quality: str = "LOW", bypass_registry: str = "false"):
    if not current_user.can_download:
        raise HTTPException(status_code=403, detail="Daily limit reached.")
    
    # Increment quota
    with next(get_session()) as s:
        db_u = s.merge(current_user)
        db_u.downloads_today += 1
        s.commit()
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
                    import asyncio
                    import httpx
                    
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


from typing import Optional
from typing import Optional
class AIPlaylistRequest(BaseModel):
    query: str
    imageBase64: Optional[str] = None
    limit: int = 10

@router.post("/api/ai-playlist", response_model=SearchResponse)
async def ai_playlist(req: AIPlaylistRequest):
    
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not set in the environment.")
        
    seed = random.randint(1, 100000)
    prompt = f"""You are an expert music curator. 
The user wants a playlist with the vibe: "{req.query}".
Generate {req.limit} real track titles and artists that perfectly match this vibe.
Make the selection unique and unexpected! Do not always return the most popular songs.
Seed: {seed}
Respond ONLY with a valid JSON array of objects.
Do not wrap in markdown tags like ```json.
Format:
[
  {{"title": "Song Title", "artist": "Artist Name"}},
  ...
]"""

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        parts = [{"text": prompt}]
        if req.imageBase64:
            try:
                mime_type = req.imageBase64.split(";")[0].split(":")[1]
                base64_data = req.imageBase64.split(",")[1]
                parts.append({
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": base64_data
                    }
                })
            except Exception as e:
                logger.info("Failed to parse imageBase64:", e)
                
        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"temperature": 1.0}
        }
        
        async with httpx.AsyncClient() as client:
            res = await client.post(url, json=payload, timeout=15.0)
            
        if res.status_code != 200:
            logger.info("Gemini API Error:", res.text)
            raise HTTPException(status_code=500, detail=f"Gemini API returned {res.status_code}")
            
        data = res.json()
        text = data['candidates'][0]['content']['parts'][0]['text'].strip()
        
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        
        songs = json.loads(text.strip())
    except Exception as e:
        logger.info("Gemini generation failed:", e)
        raise HTTPException(status_code=500, detail="Failed to generate AI playlist: ")

    p = get_provider_by_name("tidal")
    if not p:
        return SearchResponse(tracks=[])
        
    tracks = []
    async def search_song(song):
        try:
            q = f"{song['artist']} {song['title']}"
            res = await asyncio.to_thread(p.search, q, 1)
            if res and len(res) > 0:
                return res[0]
        except Exception:
            pass
        return None
        
    results = await asyncio.gather(*(search_song(s) for s in songs))
    tracks = [t for t in results if t is not None]
    
    return SearchResponse(tracks=tracks)

