import asyncio
import json
import logging
import os
import random
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from tidal_dl_ru.core.recognize import recognize_audio
from tidal_dl_ru.core.router import all_providers, get_provider_by_name
from tidal_dl_ru.database.auth import _user_from_jwt, oauth2_scheme
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import SavedTrack, User
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient, cover_url
from tidal_dl_ru.providers.tidal.provider import _to_universal
from tidal_dl_ru.server.schemas import ProviderInfo, SearchRequest, SearchResponse

logger = logging.getLogger(__name__)
router = APIRouter()

_GEMINI_MODELS = ("gemini-2.0-flash", "gemini-1.5-flash")
# Fallback seeds — artist names whose top tracks are a sane default palette
_SEED_ARTISTS = (
    "The Weeknd", "Radiohead", "Daft Punk", "Kendrick Lamar", "Arctic Monkeys",
    "Billie Eilish", "Fred again..", "Disclosure", "Bon Iver", "Tyler, The Creator",
)


def _optional_user(token: str = Depends(oauth2_scheme)) -> User | None:
    if not token:
        return None
    try:
        return _user_from_jwt(token)
    except HTTPException:
        return None


def _track_ok(track) -> bool:
    dur = getattr(track, "duration_s", None) or getattr(track, "duration", None) or 0
    if dur and dur < 45:
        return False
    return bool(getattr(track, "cover_url", None))



async def _artist_top_tracks(client: TidalClient, artist_id: str, limit: int = 15) -> list:
    try:
        top = await asyncio.to_thread(client.get_artist_top_tracks, artist_id)
        return top[:limit]
    except Exception:
        return []


async def _resolve_artist_id(p, artist_name: str) -> str | None:
    try:
        results = await asyncio.to_thread(p.search, artist_name, 3)
    except Exception:
        return None
    for t in results:
        if getattr(t, "artist_ids", None):
            return str(t.artist_ids[0])
    return None


async def _build_recommendations(limit: int, user: User | None, session: Session | None) -> list:
    p = get_provider_by_name("tidal")
    if not p:
        return []

    seen: set[str] = set()
    tracks: list = []
    artist_names: list[str] = []

    if user and session:
        saved = list(
            session.exec(
                select(SavedTrack)
                .where(SavedTrack.user_id == user.id)
                .order_by(SavedTrack.added_at.desc())
                .limit(50)
            ).all()
        )
        seen.update(str(t.provider_id) for t in saved)
        for item in saved:
            try:
                artists = json.loads(item.artists_json or "[]")
            except json.JSONDecodeError:
                artists = []
            if artists:
                artist_names.append(artists[0])

    # Personalize from library artists — top tracks from same artists (similar style)
    for artist in list(dict.fromkeys(artist_names))[:10]:
        artist_id = await _resolve_artist_id(p, artist)
        if not artist_id:
            continue
        try:
            http = httpx.Client(timeout=30.0)
            try:
                acc, tokens = tidal_pool.acquire(http)
                client = TidalClient(http=http, tokens=tokens)
            except tidal_pool.NoAccountAvailable:
                client = TidalClient(http=http)
            for t in await _artist_top_tracks(client, artist_id, 12):
                u = _to_universal(t)
                pid = str(u.provider_id)
                if pid in seen or not _track_ok(u):
                    continue
                tracks.append(u)
                seen.add(pid)
                if len(tracks) >= limit:
                    return tracks[:limit]
        except Exception as e:
            logger.info("Recommendations for artist %s failed: %s", artist, e)

    # Cold start: curated artists' top tracks (not random search terms)
    seeds = list(_SEED_ARTISTS)
    random.shuffle(seeds)
    for artist in seeds:
        if len(tracks) >= limit:
            break
        artist_id = await _resolve_artist_id(p, artist)
        if not artist_id:
            continue
        try:
            http = httpx.Client(timeout=30.0)
            try:
                acc, tokens = tidal_pool.acquire(http)
                client = TidalClient(http=http, tokens=tokens)
            except tidal_pool.NoAccountAvailable:
                client = TidalClient(http=http)
            for t in await _artist_top_tracks(client, artist_id, 5):
                u = _to_universal(t)
                pid = str(u.provider_id)
                if pid in seen or not _track_ok(u):
                    continue
                tracks.append(u)
                seen.add(pid)
                if len(tracks) >= limit:
                    return tracks[:limit]
        except Exception as e:
            logger.info("Seed recommendations for %s failed: %s", artist, e)

    return tracks[:limit]


@router.get("/api/recommendations", response_model=SearchResponse)
async def recommendations(
    limit: int = 20,
    user: User | None = Depends(_optional_user),
    session: Session = Depends(get_session),
):
    limit = max(1, min(limit, 50))
    tracks = await _build_recommendations(limit, user, session)
    if not tracks:
        raise HTTPException(status_code=503, detail="Could not load recommendations")
    return SearchResponse(tracks=tracks)


@router.get("/api/providers", response_model=list[ProviderInfo])
def providers() -> list[ProviderInfo]:
    return [ProviderInfo(name=p.name, display_name=p.display_name) for p in all_providers()]


@router.get("/api/track/{provider}/{track_id}")
async def track_meta(provider: str, track_id: str):
    """Lightweight metadata (cover, duration) for player enrichment."""
    p = get_provider_by_name(provider)
    if p is None:
        raise HTTPException(status_code=400, detail=f"unknown provider: {provider}")
    if provider != "tidal":
        raise HTTPException(status_code=400, detail="unsupported provider")

    def _fetch():
        with p._client() as c:
            return _to_universal(c.get_track(track_id))

    try:
        track = await asyncio.to_thread(_fetch)
    except Exception as e:
        logger.info("track_meta %s/%s failed: %s", provider, track_id, e)
        raise HTTPException(status_code=404, detail="track not found") from e
    return track.model_dump()

@router.post("/api/search", response_model=SearchResponse)
async def search(req: SearchRequest) -> SearchResponse:
    p = get_provider_by_name(req.provider)
    if p is None:
        raise HTTPException(status_code=400, detail=f"unknown provider: {req.provider}")

    try:
        if hasattr(p, "search_page"):
            tracks, has_more = await asyncio.to_thread(
                p.search_page, req.query, req.limit, req.offset
            )
            return SearchResponse(tracks=tracks, has_more=has_more)
        tracks = await asyncio.to_thread(p.search, req.query, req.limit)
        return SearchResponse(tracks=tracks, has_more=len(tracks) >= req.limit)
    except Exception as e:
        logger.info(f"Tidal search failed: {e}")
        raise HTTPException(status_code=503, detail="Search temporarily unavailable")

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
            raise HTTPException(status_code=503, detail="Search temporarily unavailable")

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


def _normalize_ai_query(query: str) -> str:
    q = query.strip()
    prefixes = (
        "Play tracks similar to ",
        "Сыграй треки, похожие на ",
        "Recommend me great tracks similar to: ",
        "Порекомендуй отличные треки, похожие на: ",
        "I like these songs: ",
        "Мне нравятся эти песни: ",
    )
    for p in prefixes:
        if q.startswith(p):
            q = q[len(p):].strip()
            break
    if q.endswith("."):
        q = q[:-1].strip()
    if " by " in q.lower():
        q = q.split(" by ")[0].strip()
    return q or query


async def _tidal_fallback_playlist(query: str, limit: int) -> list:
    p = get_provider_by_name("tidal")
    if not p:
        return []
    search_q = _normalize_ai_query(query)
    ql = search_q.lower()

    async def _search(term: str, n: int) -> list:
        return await asyncio.to_thread(p.search, term, min(n, 50))

    # Generic vibe / trending prompts → concrete Tidal queries that always return hits
    if any(k in ql for k in ("trend", "popular", "hit", "chart", "тренд", "популяр", "хит")):
        for term in ("top hits", "pop hits", "chart hits", "viral hits", "new releases"):
            tracks = await _search(term, limit)
            if tracks:
                return tracks[:limit]

    tracks = await _search(search_q, limit)
    seen = {t.provider_id for t in tracks}
    if len(tracks) < limit:
        for term in search_q.split()[:6]:
            if len(term) < 3:
                continue
            extra = await asyncio.to_thread(p.search, term, min(limit, 20))
            for t in extra:
                if t.provider_id not in seen:
                    tracks.append(t)
                    seen.add(t.provider_id)
                if len(tracks) >= limit:
                    break
            if len(tracks) >= limit:
                break
    return tracks[:limit]


@router.post("/api/ai-playlist", response_model=SearchResponse)
async def ai_playlist(req: AIPlaylistRequest):

    api_key = os.environ.get("GEMINI_API_KEY")

    async def _gemini_tracks() -> list:
        if not api_key:
            return []
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
            "generationConfig": {"temperature": 1.0},
        }

        text = ""
        async with httpx.AsyncClient() as client:
            for model in _GEMINI_MODELS:
                url = (
                    f"https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{model}:generateContent?key={api_key}"
                )
                res = await client.post(url, json=payload, timeout=30.0)
                if res.status_code != 200:
                    logger.info("Gemini API Error (%s): %s", model, res.text)
                    continue
                data = res.json()
                candidates = data.get("candidates") or []
                if not candidates:
                    continue
                parts_out = candidates[0].get("content", {}).get("parts") or []
                if not parts_out:
                    continue
                text = (parts_out[0].get("text") or "").strip()
                if text:
                    break

        if not text:
            return []

        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]

        songs = json.loads(text.strip())
        p = get_provider_by_name("tidal")
        if not p:
            return []

        async def search_song(song):
            title = (song.get("title") or "").strip()
            artist = (song.get("artist") or "").strip()
            for q in (f"{artist} {title}".strip(), title, artist):
                if len(q) < 2:
                    continue
                try:
                    res = await asyncio.to_thread(p.search, q, 3)
                    if res:
                        return res[0]
                except Exception:
                    continue
            return None

        results = await asyncio.gather(*(search_song(s) for s in songs))
        return [t for t in results if t is not None]

    try:
        tracks = await _gemini_tracks()
    except Exception as e:
        logger.info("Gemini generation failed: %s", e)
        tracks = []

    if not tracks:
        try:
            tracks = await _tidal_fallback_playlist(req.query, req.limit)
        except Exception as e:
            logger.info("Tidal fallback playlist failed: %s", e)
            tracks = []

    if not tracks:
        raise HTTPException(
            status_code=503,
            detail="Could not build playlist. Try a simpler query or check Tidal credentials.",
        )

    return SearchResponse(tracks=tracks)
