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
