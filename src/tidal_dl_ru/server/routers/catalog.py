import asyncio
import logging

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
from tidal_dl_ru.providers.tidal.provider import _to_universal, to_universal_enriched
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
            client = TidalClient(
                http=http,
                tokens=tokens,
                on_auth_error=lambda status, _id=acc.id: tidal_pool.report_failure(_id, status),  # type: ignore[misc]
                on_token_refresh=lambda toks, _id=acc.id: tidal_pool.update_refresh_token(  # type: ignore[misc]
                    _id, toks.refresh_token
                ),
            )
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


@router.get("/api/artist/{artist_id}/top-tracks")
async def get_artist_top_tracks_page(artist_id: str, offset: int = 0, limit: int = 20):
    """Paginated continuation of get_artist_api's top_tracks -- that endpoint
    always fetched a fixed 20 with no way to page further, so the UI's Top
    Tracks section had no load-more."""
    limit = max(1, min(limit, 50))
    offset = max(0, offset)

    http = httpx.Client(timeout=30.0)
    try:
        try:
            acc, tokens = tidal_pool.acquire(http)
            client = TidalClient(
                http=http,
                tokens=tokens,
                on_auth_error=lambda status, _id=acc.id: tidal_pool.report_failure(_id, status),  # type: ignore[misc]
                on_token_refresh=lambda toks, _id=acc.id: tidal_pool.update_refresh_token(  # type: ignore[misc]
                    _id, toks.refresh_token
                ),
            )
        except tidal_pool.NoAccountAvailable:
            client = TidalClient(http=http)

        top_tracks = await asyncio.to_thread(client.get_artist_top_tracks, artist_id, limit, offset)

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
        return {"top_tracks": tracks_univ, "has_more": len(top_tracks) >= limit}
    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error fetching top tracks page for artist {artist_id}: {e}")
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
            client = TidalClient(
                http=http,
                tokens=tokens,
                on_auth_error=lambda status, _id=acc.id: tidal_pool.report_failure(_id, status),  # type: ignore[misc]
                on_token_refresh=lambda toks, _id=acc.id: tidal_pool.update_refresh_token(  # type: ignore[misc]
                    _id, toks.refresh_token
                ),
            )
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
- 2–4 предложения на русском
- ТОЛЬКО музыкальная карьера, жанр, звучание, сцена
- Если ТОЧНО знаешь реальный, проверяемый факт об артисте — можешь добавить один. НИКОГДА не выдумывай факты, истории, сны или «источники вдохновения». Нет достоверного факта — просто не добавляй его
- НЕ путай с актёрами, спортсменами, однофамильцами (пример: NTO — электронный продюсер, не актёр)
- Избегай скучных энциклопедических штампов и дат рождения
- Пиши живо и профессионально, без ИИ-штампов вроде "этот артист известен тем, что"
- Мало данных — опиши жанр осторожно, без выдуманных фактов. Точность важнее «интересности»
- Только plain text, без markdown"""
        else:
            prompt = f"""You write short artist bios for a music streaming app.

Artist: {name}
Known tracks in catalog:
{tracks_block}

Rules:
- 2–4 sentences in English
- ONLY music career, genre, sound, scene — no film/TV/other homonyms
- You MAY add one real, verifiable fact ONLY if you genuinely know it. NEVER invent facts, dreams, inspirations or backstories — if you have no reliable fact, simply omit it
- Do NOT confuse with actors or athletes (e.g. NTO = electronic producer, not an actor)
- Avoid encyclopedic clichés and birth dates; write lively and professionally
- If unsure, describe the genre/sound cautiously without inventing anything. Accuracy over interestingness
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
            client = TidalClient(
                http=http,
                tokens=tokens,
                on_auth_error=lambda status, _id=acc.id: tidal_pool.report_failure(_id, status),  # type: ignore[misc]
                on_token_refresh=lambda toks, _id=acc.id: tidal_pool.update_refresh_token(  # type: ignore[misc]
                    _id, toks.refresh_token
                ),
            )
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
