import asyncio
import json
import logging
import os
import random
import re
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session

from tidal_dl_ru.core.recognize import recognize_audio
from tidal_dl_ru.core.router import all_providers, get_provider_by_name
from tidal_dl_ru.database.auth import _user_from_jwt, get_current_user, oauth2_scheme
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import User
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient, cover_url
from tidal_dl_ru.providers.tidal.models import Artist as TidalArtist
from tidal_dl_ru.providers.tidal.provider import _to_universal, to_universal_enriched
from tidal_dl_ru.server.ai_playlist_cache import cache_get as ai_cache_get
from tidal_dl_ru.server.ai_playlist_cache import cache_set as ai_cache_set
from tidal_dl_ru.server.artist_bio_cache import bio_cache_get, bio_cache_set
from tidal_dl_ru.server.artist_image import resolve_artist_picture_url
from tidal_dl_ru.server.gemini_text import gemini_generate_text
from tidal_dl_ru.server.recommendations import (
    _get_genres_db,
    build_recommendations,
    build_track_radio,
    build_track_radio_fast,
)
from tidal_dl_ru.server.schemas import ProviderInfo, SearchRequest, SearchResponse

logger = logging.getLogger(__name__)
router = APIRouter()

# Order matters: try stable/cheap models first. 1.5-flash is retired on v1beta (404).
_DEFAULT_GEMINI_MODELS = (
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.5-flash",
)


def _gemini_models() -> tuple[str, ...]:
    raw = os.environ.get("TIDALDLRU_GEMINI_MODELS", "").strip()
    if not raw:
        return _DEFAULT_GEMINI_MODELS
    return tuple(m.strip() for m in raw.split(",") if m.strip())
_DJ_PLANS = frozenset({"pro", "lifetime"})


def _optional_user(token: str = Depends(oauth2_scheme)) -> User | None:
    if not token:
        return None
    try:
        return _user_from_jwt(token)
    except HTTPException:
        return None


def _parse_exclude_ids(raw: str | None) -> set[str]:
    if not raw:
        return set()
    ids = {part.strip() for part in raw.split(",") if part.strip()}
    if len(ids) > 250:
        raise HTTPException(status_code=400, detail="Too many exclude ids")
    return ids


@router.get("/api/genres")
def get_genres():
    db = _get_genres_db()
    # Return as list of categories to maintain order if desired, or just raw db dict.
    # The frontend expects either an array or object. Let's return the dict values as list
    # or just the dict itself.
    return db

@router.get("/api/recommendations", response_model=SearchResponse)
async def recommendations(
    limit: int = 20,
    refresh: bool = True,
    exclude: str | None = None,
    genre: str | None = None,
    user: User | None = Depends(_optional_user),
    session: Session = Depends(get_session),
):
    limit = max(1, min(limit, 50))
    exclude_ids = _parse_exclude_ids(exclude)
    tracks = await build_recommendations(
        limit,
        user,
        session,
        skip_cache=refresh or bool(exclude_ids),
        exclude_ids=exclude_ids,
        genre=genre,
    )
    if not tracks:
        if exclude_ids:
            return SearchResponse(tracks=[])
        raise HTTPException(
            status_code=503,
            detail={"code": "search_unavailable", "message": "Could not load recommendations"},
        )
    return SearchResponse(tracks=tracks)


@router.get("/api/track/{provider}/{track_id}/radio", response_model=SearchResponse)
async def track_radio(
    provider: str,
    track_id: str,
    limit: int = 30,
    fast: bool = False,
    user: User | None = Depends(_optional_user),
    session: Session = Depends(get_session),
):
    if provider != "tidal":
        raise HTTPException(status_code=400, detail="Only tidal provider supported")
    limit = max(1, min(limit, 60))
    if fast:
        tracks = await build_track_radio_fast(track_id, limit)
    else:
        tracks = await build_track_radio(track_id, limit, user=user, session=session)
    if not tracks:
        raise HTTPException(status_code=503, detail="Could not load track radio")
    return SearchResponse(tracks=tracks)


@router.get("/api/track/{provider}/{track_id}/dj-meta")
async def track_dj_meta(
    provider: str,
    track_id: str,
    current_user: User = Depends(get_current_user),
):
    if provider != "tidal":
        raise HTTPException(status_code=400, detail="Only tidal provider supported")
    if current_user.effective_plan not in _DJ_PLANS or not current_user.dj_enabled:
        raise HTTPException(
            status_code=403,
            detail="DJ analysis requires Pro plan and profile setting",
        )

    from tidal_dl_ru.server.dj_preview import analyze_tidal_track_preview

    result = await asyncio.to_thread(analyze_tidal_track_preview, track_id)
    if not result:
        raise HTTPException(status_code=503, detail="DJ preview analysis unavailable")
    return result


@router.get("/api/providers", response_model=list[ProviderInfo])
def providers() -> list[ProviderInfo]:
    return [ProviderInfo(name=p.name, display_name=p.display_name) for p in all_providers()]


class TracksMetaRequest(BaseModel):
    provider: str = "tidal"
    ids: list[str]


class TracksMetaResponse(BaseModel):
    tracks: list[dict]


def _fetch_track_meta_dict(provider: str, track_id: str) -> dict | None:
    p = get_provider_by_name(provider)
    if p is None or provider != "tidal":
        return None

    def _fetch():
        with p._client() as c:
            return to_universal_enriched(c, c.get_track(track_id))

    try:
        track = _fetch()
    except Exception as e:
        logger.info("track_meta %s/%s failed: %s", provider, track_id, e)
        return None
    return track.model_dump()


@router.get("/api/track/{provider}/{track_id}")
async def track_meta(provider: str, track_id: str):
    """Lightweight metadata (cover, duration) for player enrichment."""
    if provider != "tidal":
        raise HTTPException(status_code=400, detail="unsupported provider")
    track = await asyncio.to_thread(_fetch_track_meta_dict, provider, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="track not found")
    return track


@router.post("/api/tracks/meta", response_model=TracksMetaResponse)
async def tracks_meta_batch(body: TracksMetaRequest):
    """Batch metadata (cover, duration) for playlist enrichment."""
    provider = (body.provider or "tidal").strip().lower()
    if provider != "tidal":
        raise HTTPException(status_code=400, detail="unsupported provider")
    if get_provider_by_name(provider) is None:
        raise HTTPException(status_code=400, detail=f"unknown provider: {provider}")

    ids = [str(i).strip() for i in (body.ids or []) if str(i).strip()]
    if not ids:
        return TracksMetaResponse(tracks=[])
    if len(ids) > 40:
        raise HTTPException(status_code=400, detail="max 40 track ids per request")

    sem = asyncio.Semaphore(8)

    async def _one(track_id: str):
        async with sem:
            row = await asyncio.to_thread(_fetch_track_meta_dict, provider, track_id)
            return row

    rows = await asyncio.gather(*(_one(i) for i in ids))
    return TracksMetaResponse(tracks=[r for r in rows if r])

async def _enrich_search_tracks_year(tracks: list) -> list:
    """Fill missing release year on search hits (Tidal search stubs often omit dates)."""
    if not tracks:
        return tracks
    missing = [t for t in tracks if not getattr(t, "year", None) and not getattr(t, "release_date", None)]
    if not missing:
        return tracks
    p = get_provider_by_name("tidal")
    if not p:
        return tracks
    sem = asyncio.Semaphore(8)

    async def _one(track):
        async with sem:
            def _build():
                with p._client() as client:
                    full = client.get_track(track.provider_id)
                    return to_universal_enriched(client, full)

            try:
                return await asyncio.to_thread(_build)
            except Exception:
                return track

    updated = {t.provider_id: t for t in tracks}
    enriched = await asyncio.gather(*(_one(t) for t in missing[:30]))
    for u in enriched:
        updated[u.provider_id] = u
    return [updated[t.provider_id] for t in tracks]


@router.post("/api/search", response_model=SearchResponse)
async def search(req: SearchRequest) -> SearchResponse:
    p = get_provider_by_name(req.provider)
    if p is None:
        raise HTTPException(status_code=400, detail=f"unknown provider: {req.provider}")

    try:
        from tidal_dl_ru.server.search_typo import suggest_search_query

        query = req.query.strip()
        search_terms = [query]
        layout_fix, layout_kind = suggest_search_query(query)
        if (
            layout_fix
            and layout_kind == "layout"
            and layout_fix.strip().lower() != query.lower()
        ):
            search_terms = [layout_fix.strip(), query]

        tracks: list = []
        has_more = False
        for term in search_terms:
            if hasattr(p, "search_page"):
                tracks, has_more = await asyncio.to_thread(
                    p.search_page, term, req.limit, req.offset
                )
            else:
                tracks = await asyncio.to_thread(p.search, term, req.limit)
                has_more = len(tracks) >= req.limit
            if tracks:
                break

        if tracks and req.provider == "tidal" and req.offset == 0:
            tracks = await _enrich_search_tracks_year(tracks)

        if not tracks and req.offset == 0:
            from tidal_dl_ru.server.search_typo import suggest_trim_suffix_search

            suggested, kind = layout_fix, layout_kind
            if not suggested:
                suggested, kind = suggest_search_query(query)
            if not suggested and hasattr(p, "search_page"):
                def _do_trim():
                    return suggest_trim_suffix_search(
                        req.query,
                        lambda q, limit, offset: p.search_page(q, limit, offset),
                    )
                trimmed = await asyncio.to_thread(_do_trim)

                if trimmed and trimmed.strip().lower() != req.query.strip().lower():
                    suggested = trimmed
                    kind = "typo"
            if suggested:
                return SearchResponse(
                    tracks=[],
                    has_more=False,
                    suggested_query=suggested,
                    suggestion_kind=kind,
                )
        return SearchResponse(tracks=tracks, has_more=has_more)
    except HTTPException:
        raise
    except (httpx.HTTPError, OSError, TimeoutError, ValueError) as e:
        logger.info(f"Tidal search failed: {e}")
        raise HTTPException(
            status_code=503,
            detail={"code": "search_unavailable", "message": "Search temporarily unavailable"},
        ) from e
    except Exception as e:
        logger.exception("Tidal search unexpected error: %s", e)
        raise HTTPException(
            status_code=503,
            detail={"code": "search_unavailable", "message": "Search temporarily unavailable"},
        ) from e

@router.post("/api/recognize", response_model=SearchResponse)
async def recognize_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    if not file.content_type or not str(file.content_type).startswith("audio/"):
        raise HTTPException(status_code=400, detail="Expected an audio file")

    max_bytes = 12 * 1024 * 1024
    audio_bytes = await file.read(max_bytes + 1)
    if len(audio_bytes) > max_bytes:
        raise HTTPException(status_code=413, detail="Audio file too large (max 12 MB)")

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
            raise HTTPException(
            status_code=503,
            detail={"code": "search_unavailable", "message": "Search temporarily unavailable"},
        )

    return SearchResponse(tracks=[])

@router.get("/api/artist/{artist_id}")
async def get_artist_api(artist_id: str):

    http = httpx.Client(timeout=30.0)
    try:
        try:
            acc, tokens = tidal_pool.acquire(http)
            client = TidalClient(http=http, tokens=tokens)
        except tidal_pool.NoAccountAvailable:
            client = TidalClient(http=http)

        artist = await asyncio.to_thread(client.get_artist, artist_id)
        albums = await asyncio.to_thread(client.get_artist_albums, artist_id)
        top_tracks = await asyncio.to_thread(client.get_artist_top_tracks, artist_id)

        async def _enrich_track_meta(tidal_track):
            def _build():
                uni = _to_universal(tidal_track)
                full = tidal_track
                if not (uni.release_date or uni.year):
                    try:
                        full = client.get_track(tidal_track.id)
                    except Exception:
                        pass
                return to_universal_enriched(client, full).model_dump()

            return await asyncio.to_thread(_build)

        tracks_univ = await asyncio.gather(*(_enrich_track_meta(t) for t in top_tracks))

        artist_dict = artist.model_dump()
        picture_url, picture_source = await asyncio.to_thread(
            resolve_artist_picture_url,
            artist.name or "",
            artist_id=artist_id,
            tidal_picture_id=artist.picture,
            tidal_cover_url_fn=cover_url,
        )
        if picture_url:
            artist_dict["picture_url"] = picture_url
        artist_dict["picture_source"] = picture_source

        albums_list = []
        for a in albums:
            ad = a.model_dump()
            ad["cover_url"] = cover_url(a.cover, size=640) if a.cover else None
            albums_list.append(ad)

        return {
            "artist": artist_dict,
            "albums": albums_list,
            "top_tracks": tracks_univ
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error fetching artist {artist_id}: {e}")
        raise HTTPException(
            status_code=503,
            detail={"code": "artist_unavailable", "message": "Artist unavailable"},
        ) from e
    finally:
        http.close()


@router.get("/api/artist/{artist_id}/bio")
async def get_artist_bio_api(
    artist_id: str,
    lang: str = "en",
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    locale = "ru" if (lang or "").lower().startswith("ru") else "en"
    cached = bio_cache_get(artist_id, locale)
    if cached:
        return {"bio": cached, "source": "cache"}

    http = httpx.Client(timeout=30.0)
    try:
        try:
            acc, tokens = tidal_pool.acquire(http)
            client = TidalClient(http=http, tokens=tokens)
        except tidal_pool.NoAccountAvailable:
            client = TidalClient(http=http)

        artist = await asyncio.to_thread(client.get_artist, artist_id)
        top_tracks = await asyncio.to_thread(client.get_artist_top_tracks, artist_id)
        track_titles = [
            f"{(t.title or '').strip()} — {', '.join(a.name for a in (t.artists or []) if a.name)}"
            for t in top_tracks[:5]
            if (t.title or '').strip()
        ]
        name = artist.name or artist_id
        tracks_block = "\n".join(f"- {line}" for line in track_titles) or "- (no tracks listed)"

        if locale == "ru":
            prompt = f"""Ты пишешь короткие био музыкальных артистов для стримингового приложения.

Артист: {name}
Известные треки в каталоге:
{tracks_block}

Правила:
- 2–3 предложения на русском
- ТОЛЬКО музыкальная карьера, жанр, звучание, сцена
- НЕ путай с актёрами, спортсменами, однофамильцами (пример: NTO — электронный продюсер, не актёр)
- Без Wikipedia-штампов и дат рождения
- Если мало данных — опиши жанр осторожно, без выдуманных фактов
- Только plain text, без markdown"""
        else:
            prompt = f"""You write short artist bios for a music streaming app.

Artist: {name}
Known tracks in catalog:
{tracks_block}

Rules:
- 2–3 sentences in English
- ONLY music career, genre, sound, scene — no film/TV/other homonyms
- Do NOT confuse with actors or athletes (e.g. NTO = electronic producer, not an actor)
- No Wikipedia clichés or birth dates
- If unsure, describe genre cautiously without invented facts
- Plain text only, no markdown"""

        bio = await gemini_generate_text(prompt, temperature=0.35)
        if not bio:
            return {"bio": "", "source": "unavailable"}

        bio_cache_set(artist_id, locale, bio)
        return {"bio": bio, "source": "gemini"}
    except Exception as e:
        logger.info("Artist bio failed for %s: %s", artist_id, e)
        return {"bio": "", "source": "error"}
    finally:
        http.close()


@router.get("/api/album/{album_id}")
async def get_album_api(album_id: str):

    http = httpx.Client(timeout=30.0)
    try:
        try:
            acc, tokens = tidal_pool.acquire(http)
            client = TidalClient(http=http, tokens=tokens)
        except tidal_pool.NoAccountAvailable:
            client = TidalClient(http=http)

        album = await asyncio.to_thread(client.get_album, album_id)
        tracks = await asyncio.to_thread(client.get_album_tracks, album_id)

        album_dict = album.model_dump()
        album_dict["cover_url"] = cover_url(album.cover, size=640) if album.cover else None

        tracks_univ = []
        for t in tracks:
            t.album = album
            tracks_univ.append(_to_universal(t).model_dump())

        return {
            "album": album_dict,
            "tracks": tracks_univ
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error fetching album {album_id}: {e}")
        raise HTTPException(
            status_code=503,
            detail={"code": "album_unavailable", "message": "Album unavailable"},
        ) from e
    finally:
        http.close()

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


def _library_seed_titles_from_query(query: str) -> list[str]:
    """Semicolon-separated titles from My Vibe / library-taste prompts."""
    q = query.strip()
    pairs = (
        ("I like these songs:", ". Give me a radio mix based on this taste"),
        ("Мне нравятся эти песни:", ". Сделай радио-микс на основе моего вкуса."),
    )
    for start, end in pairs:
        low = q.lower()
        s = start.lower()
        if s not in low:
            continue
        idx = low.index(s)
        rest = q[idx + len(start) :].strip()
        e = end.lower()
        if e in rest.lower():
            rest = rest[: rest.lower().index(e)].strip()
        return [p.strip() for p in rest.split(";") if p.strip()]
    return []


_ARTIST_FOCUS_SUFFIX = re.compile(
    r"^(?P<name>.+?)\s+"
    r"(?:tracks?|songs?|music|треки?|песни?|песен|треков|hits|дискографи[яю]|best\s+of)$",
    re.I,
)
_ARTIST_FOCUS_PREFIX = re.compile(
    r"^(?:tracks?|songs?|треки?|песни?)\s+by\s+(?P<name>.+)$",
    re.I,
)
_ARTIST_SIMILAR_PATTERNS = (
    re.compile(r"^(?:tracks?|songs?|music|треки?|песни?)\s+like\s+(?P<name>.+)$", re.I),
    re.compile(r"^(?:tracks?|songs?|треки?|песни?)\s+similar\s+to\s+(?P<name>.+)$", re.I),
    re.compile(
        r"^(?:tracks?|songs?|music|треки?|песни?)\s+in\s+(?:the\s+)?style\s+of\s+(?P<name>.+)$",
        re.I,
    ),
    re.compile(r"^in\s+(?:the\s+)?style\s+of\s+(?P<name>.+)$", re.I),
    re.compile(r"^(?P<name>.+?)\s+style\s+(?:tracks?|songs?|music|треки?|песни?)$", re.I),
    re.compile(r"^similar\s+to\s+(?P<name>.+)$", re.I),
    re.compile(r"^like\s+(?P<name>.+)$", re.I),
    re.compile(r"^sounds?\s+like\s+(?P<name>.+)$", re.I),
    re.compile(r"^(?:в\s+стиле|как\s+у|похожие\s+на|похожие\s+треки\s+на)\s+(?P<name>.+)$", re.I),
    re.compile(
        r"^(?:треки?|песни?)\s+(?:как\s+у|в\s+стиле|похожие\s+на)\s+(?P<name>.+)$",
        re.I,
    ),
)
_ARTIST_FOCUS_LABEL = re.compile(
    r"^(?:artist|артист|исполнитель)\s+(?P<name>.+)$",
    re.I,
)
_ARTIST_FOCUS_LEADING = re.compile(
    r"^(?:треки?|песни?)\s+(?P<name>.+)$",
    re.I,
)
_ARTIST_FOCUS_LEADING_SKIP = (
    "like ",
    "similar ",
    "in style of ",
    "in the style of ",
    "как у ",
    "в стиле ",
    "похож",
)
_ARTIST_FOCUS_FILLERS = (
    "play ",
    "give me ",
    "show me ",
    "i want ",
    "сыграй ",
    "дай ",
    "покажи ",
    "хочу ",
    "only ",
    "just ",
)
# Genre/mood words — "chill tracks" is a vibe, not artist "Chill".
_ARTIST_FOCUS_BLOCKLIST = frozenset({
    "chill", "summer", "winter", "spring", "autumn", "night", "morning",
    "party", "workout", "gym", "deep", "house", "techno", "trance", "lofi",
    "lo-fi", "focus", "sad", "happy", "best", "top", "new", "old", "classic",
    "indie", "rock", "pop", "jazz", "metal", "rap", "hip", "hop", "edm",
    "electronic", "ambient", "rain", "sunny", "vibe", "mix", "radio",
    "летн", "зим", "ноч", "утр", "вечер", "груст", "весел", "трен", "радио",
})


def _strip_artist_focus_filler(query: str) -> str:
    q = query.strip()
    while True:
        low = q.lower()
        matched = False
        for prefix in _ARTIST_FOCUS_FILLERS:
            if low.startswith(prefix):
                q = q[len(prefix):].strip()
                matched = True
                break
        if not matched:
            break
    return q


def _clean_artist_query_name(name: str) -> str | None:
    cleaned = (name or "").strip(" .,!?\"'")
    if not cleaned or len(cleaned) < 2 or len(cleaned) > 80:
        return None
    tokens = {t.lower() for t in re.split(r"\s+", cleaned) if t}
    if tokens & _ARTIST_FOCUS_BLOCKLIST:
        return None
    if cleaned.lower() in _ARTIST_FOCUS_BLOCKLIST:
        return None
    return cleaned


def _extract_artist_similar(query: str) -> str | None:
    """Style neighbours — e.g. 'tracks like Black Coffee', 'похожие на Daft Punk'."""
    q = _strip_artist_focus_filler(query.strip())
    if not q or ";" in q or " - " in q:
        return None
    for pattern in _ARTIST_SIMILAR_PATTERNS:
        m = pattern.match(q)
        if m:
            return _clean_artist_query_name(m.group("name") or "")
    return None


def _extract_artist_focus(query: str) -> str | None:
    """Explicit artist discography prompts — e.g. 'moojo tracks', 'треки Morgenshtern'."""
    if _extract_artist_similar(query):
        return None
    q = _strip_artist_focus_filler(query.strip())
    if not q or ";" in q or " - " in q:
        return None
    name: str | None = None
    for pattern in (_ARTIST_FOCUS_SUFFIX, _ARTIST_FOCUS_PREFIX, _ARTIST_FOCUS_LABEL):
        m = pattern.match(q)
        if m:
            name = (m.group("name") or "").strip(" .,!?\"'")
            break
    if not name:
        m = _ARTIST_FOCUS_LEADING.match(q)
        if m:
            candidate = (m.group("name") or "").strip(" .,!?\"'")
            low = candidate.lower()
            if not any(low.startswith(skip) for skip in _ARTIST_FOCUS_LEADING_SKIP):
                name = candidate
    return _clean_artist_query_name(name) if name else None


def _artist_name_matches(artist: str, target: str) -> bool:
    a = artist.strip().lower()
    t = target.strip().lower()
    if not a or not t:
        return False
    return a == t or t in a or a in t


def _pick_artist_match(candidates: list[TidalArtist], target: str) -> TidalArtist | None:
    if not candidates:
        return None
    t = target.strip().lower()
    exact = [a for a in candidates if a.name.strip().lower() == t]
    if exact:
        return exact[0]
    partial = [a for a in candidates if _artist_name_matches(a.name, target)]
    if partial:
        return min(partial, key=lambda a: abs(len(a.name) - len(target)))
    return candidates[0]


async def _artist_focus_playlist(artist_name: str, limit: int) -> list:
    """Top tracks from a named artist (Tidal artist search + toptracks)."""
    p = get_provider_by_name("tidal")
    if not p:
        return []

    def _build() -> list:
        http = httpx.Client(timeout=30.0)
        try:
            try:
                acc, tokens = tidal_pool.acquire(http)
                client = TidalClient(http=http, tokens=tokens)
            except tidal_pool.NoAccountAvailable:
                client = TidalClient(http=http)

            tracks: list = []
            seen: set[str] = set()

            artists = client.search_artists(artist_name, limit=12)
            picked = _pick_artist_match(artists, artist_name)
            if picked:
                for tt in client.get_artist_top_tracks(picked.id):
                    uni = to_universal_enriched(client, tt)
                    if uni.provider_id not in seen:
                        tracks.append(uni)
                        seen.add(uni.provider_id)
                    if len(tracks) >= limit:
                        return tracks[:limit]

            for t in p.search(artist_name, limit=max(limit * 4, 20)):
                if not any(_artist_name_matches(a, artist_name) for a in (t.artists or [])):
                    continue
                if t.provider_id in seen:
                    continue
                tracks.append(t)
                seen.add(t.provider_id)
                if len(tracks) >= limit:
                    break
            return tracks[:limit]
        finally:
            http.close()

    return await asyncio.to_thread(_build)


async def _artist_similar_playlist(artist_name: str, limit: int) -> list:
    """Tracks in the style of an artist — Tidal artist radio + similar artists."""
    p = get_provider_by_name("tidal")
    if not p:
        return []

    def _build() -> list:
        http = httpx.Client(timeout=30.0)
        try:
            try:
                acc, tokens = tidal_pool.acquire(http)
                client = TidalClient(http=http, tokens=tokens)
            except tidal_pool.NoAccountAvailable:
                client = TidalClient(http=http)

            tracks: list = []
            seen: set[str] = set()
            seed_id: str | None = None

            artists = client.search_artists(artist_name, limit=12)
            picked = _pick_artist_match(artists, artist_name)
            if not picked:
                return []

            seed_id = str(picked.id)

            for t in client.get_artist_radio(picked.id, max(limit * 2, 30)):
                uni = to_universal_enriched(client, t)
                if uni.provider_id in seen:
                    continue
                tracks.append(uni)
                seen.add(uni.provider_id)
                if len(tracks) >= limit:
                    return tracks[:limit]

            for sa in client.get_similar_artists(picked.id, limit=10):
                if str(sa.id) == seed_id:
                    continue
                for t in client.get_artist_top_tracks(sa.id)[:4]:
                    uni = to_universal_enriched(client, t)
                    if uni.provider_id in seen:
                        continue
                    tracks.append(uni)
                    seen.add(uni.provider_id)
                    if len(tracks) >= limit:
                        return tracks[:limit]

            tops = client.get_artist_top_tracks(picked.id)
            if tops and len(tracks) < limit:
                for t in client.get_track_radio(tops[0].id, limit):
                    uni = to_universal_enriched(client, t)
                    if uni.provider_id in seen:
                        continue
                    tracks.append(uni)
                    seen.add(uni.provider_id)
                    if len(tracks) >= limit:
                        break

            return tracks[:limit]
        finally:
            http.close()

    return await asyncio.to_thread(_build)


def _looks_like_vibe_prompt(query: str) -> bool:
    """Mood/scene prompts — not explicit artist/title lookups."""
    q = query.strip()
    if not q or ";" in q:
        return False
    if _extract_artist_focus(query):
        return False
    if _extract_artist_similar(query):
        return False
    if _library_seed_titles_from_query(query):
        return False
    low = q.lower()
    if " by " in low or " - " in q:
        return False
    if low.startswith(("play ", "сыграй ", "track ", "трек ")):
        return False
    return len(q) <= 96


def _vibe_fallback_search_terms(query: str) -> list[str]:
    """Expand mood prompts into concrete Tidal queries — avoid literal phrase search."""
    ql = _normalize_ai_query(query).lower()
    terms: list[str] = []

    def add(*items: str) -> None:
        for item in items:
            if item and item not in terms:
                terms.append(item)

    summer = ("летн", "summer", "погод", "sun", "солн", "жар", "heat", "beach", "пляж", "vacation")
    night = ("night", "ноч", "midnight", "late night", "полноч")
    chill = ("chill", "relax", "лофи", "lofi", "спокой", "calm", "cozy", "уют")
    energy = ("workout", "gym", "трен", "energy", "энерг", "run", "бег", "party", "вечеринк")
    rain = ("rain", "дожд", "melanch", "груст", "sad")
    focus = ("focus", "coding", "код", "study", "учёб", "concentrat", "работ")

    if any(k in ql for k in summer):
        add("summer hits", "feel good summer", "summer pop", "chill summer", "tropical house")
    if any(k in ql for k in night):
        add("late night vibes", "night drive", "after hours", "nocturnal")
    if any(k in ql for k in chill):
        add("chill vibes", "lofi beats", "easy listening", "soft pop")
    if any(k in ql for k in energy):
        add("workout hits", "dance pop", "high energy", "party anthems")
    if any(k in ql for k in rain):
        add("rainy day", "melancholic indie", "sad songs", "ambient")
    if any(k in ql for k in focus):
        add("focus flow", "deep work", "instrumental electronic", "study beats")

    if not terms:
        add("mood mix", "feel good", "discovery mix")

    # Literal query only as a last resort — often returns title-keyword junk.
    literal = _normalize_ai_query(query)
    if literal and literal not in terms:
        terms.append(literal)
    return terms


async def _tidal_fallback_playlist(query: str, limit: int) -> list:
    similar = _extract_artist_similar(query)
    if similar:
        focus = await _artist_similar_playlist(similar, limit)
        if focus:
            return focus

    artist = _extract_artist_focus(query)
    if artist:
        focus = await _artist_focus_playlist(artist, limit)
        if focus:
            return focus

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

    seed_titles = _library_seed_titles_from_query(query)
    if seed_titles:
        tracks = []
        seen: set[str] = set()
        for title in seed_titles:
            if len(tracks) >= limit:
                break
            extra = await _search(title, 5)
            for t in extra:
                if t.provider_id not in seen:
                    tracks.append(t)
                    seen.add(t.provider_id)
                if len(tracks) >= limit:
                    break
        return tracks[:limit]

    if _looks_like_vibe_prompt(query):
        tracks = []
        seen = set()
        for term in _vibe_fallback_search_terms(query):
            if len(tracks) >= limit:
                break
            extra = await _search(term, min(limit, 20))
            for t in extra:
                if t.provider_id not in seen:
                    tracks.append(t)
                    seen.add(t.provider_id)
                if len(tracks) >= limit:
                    break
        if tracks:
            return tracks[:limit]

    tracks = await _search(search_q, limit)
    seen = {t.provider_id for t in tracks}
    # Do not split vibe prompts word-by-word — "погода летняя" → songs with those words in the title.
    if (
        len(tracks) < limit
        and ";" not in search_q
        and len(search_q) < 72
        and not _looks_like_vibe_prompt(query)
    ):
        for term in search_q.split()[:6]:
            word = term.strip(";,.").lower()
            if len(word) < 4:
                continue
            extra = await asyncio.to_thread(p.search, word, min(limit, 20))
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
    req.limit = max(1, min(req.limit, 25))
    has_image = bool(req.imageBase64)
    artist_similar = _extract_artist_similar(req.query) if not has_image else None
    artist_focus = _extract_artist_focus(req.query) if not has_image else None

    if not artist_focus and not artist_similar:
        cached = ai_cache_get(req.query, req.limit, has_image=has_image)
        if cached is not None:
            return SearchResponse(tracks=cached)

    if artist_similar:
        try:
            tracks = await _artist_similar_playlist(artist_similar, req.limit)
            if tracks:
                ai_cache_set(req.query, req.limit, tracks, has_image=has_image)
                return SearchResponse(tracks=tracks)
        except Exception as e:
            logger.info("Artist-similar playlist failed: %s", e)

    if artist_focus:
        try:
            tracks = await _artist_focus_playlist(artist_focus, req.limit)
            if tracks:
                ai_cache_set(req.query, req.limit, tracks, has_image=has_image)
                return SearchResponse(tracks=tracks)
        except Exception as e:
            logger.info("Artist-focus playlist failed: %s", e)

    api_key = os.environ.get("GEMINI_API_KEY")

    async def _gemini_tracks() -> list:
        if not api_key:
            return []
        seed = random.randint(1, 100000)
        if artist_focus:
            prompt = f"""You are an expert music curator.

The user wants tracks FROM a specific artist.
Artist: "{artist_focus}"
User prompt: "{req.query}"

Rules:
- Every track MUST be by "{artist_focus}" (or the same artist under spelling variants).
- Pick their best-known, real songs on streaming services — not other artists.
- Do NOT substitute similar artists or mood-based picks.
- Generate exactly {req.limit} distinct tracks. Seed: {seed}

Respond ONLY with a valid JSON array of objects. No markdown fences.
Format:
[
  {{"title": "Song Title", "artist": "Artist Name"}},
  ...
]"""
        elif artist_similar:
            prompt = f"""You are an expert music curator.

The user wants tracks SIMILAR IN STYLE to the artist "{artist_similar}".
User prompt: "{req.query}"

Rules:
- Pick real tracks by artists in the same genre, mood, and era as "{artist_similar}".
- Prefer OTHER artists — not only "{artist_similar}"'s own discography.
- Do NOT pick unrelated genres or literal keyword matches from the user's phrase.
- Generate exactly {req.limit} distinct tracks. Seed: {seed}

Respond ONLY with a valid JSON array of objects. No markdown fences.
Format:
[
  {{"title": "Song Title", "artist": "Artist Name"}},
  ...
]"""
        else:
            prompt = f"""You are an expert music curator.

The user describes a MOOD, VIBE, SCENE, or ACTIVITY — not a song title to look up literally.
User prompt: "{req.query}"

Rules:
- Interpret the feeling (energy, genre, era, setting). Example: "summer weather" / "погода летняя" → warm pop, indie summer, beach drive — NOT songs whose titles are just those words.
- Do NOT pick tracks whose titles are obvious keyword matches or reorderings of the user's phrase.
- Mix eras and genres; avoid {req.limit} nearly identical songs.
- Only suggest real, well-known tracks that exist on streaming services.
- Match the user's language context when sensible (RU prompts → include Russian artists too).

Generate exactly {req.limit} tracks. Seed: {seed}

Respond ONLY with a valid JSON array of objects. No markdown fences.
Format:
[
  {{"title": "Song Title", "artist": "Artist Name"}},
  ...
]"""

        parts: list[dict[str, Any]] = [{"text": prompt}]
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
            for model in _gemini_models():
                url = (
                    f"https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{model}:generateContent?key={api_key}"
                )
                res = await client.post(url, json=payload, timeout=30.0)
                if res.status_code != 200:
                    logger.warning(
                        "Gemini API error model=%s status=%s body=%s",
                        model,
                        res.status_code,
                        (res.text or "")[:240],
                    )
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
                    res = await asyncio.to_thread(p.search, q, 5)
                    for candidate in res:
                        if artist_focus and not any(
                            _artist_name_matches(a, artist_focus) for a in (candidate.artists or [])
                        ):
                            continue
                        if artist and not any(
                            _artist_name_matches(a, artist) for a in (candidate.artists or [])
                        ):
                            continue
                        return candidate
                    if res and not artist_focus:
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
        logger.info("AI playlist: Gemini returned no tracks, using Tidal search fallback")
        try:
            tracks = await _tidal_fallback_playlist(req.query, req.limit)
        except Exception as e:
            logger.info("Tidal fallback playlist failed: %s", e)
            tracks = []

    if not tracks:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "search_unavailable",
                "message": "Could not build playlist. Try a simpler query or check Tidal credentials.",
            },
        )

    ai_cache_set(req.query, req.limit, tracks, has_image=has_image)
    return SearchResponse(tracks=tracks)
