import asyncio
import json
import logging
import random
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from tidal_dl_ru.core.set_audio_cache import cache_path, has_cached_set_audio
from tidal_dl_ru.core.set_search import build_similar_queries, fetch_set_info, search_sets
from tidal_dl_ru.core.set_track_match import match_tidal_track
from tidal_dl_ru.core.tracklist_parser import parse_tracklist_from_description
from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import SavedSet, SavedSetRead, SavedTrack, User
from tidal_dl_ru.server import rec_cache
from tidal_dl_ru.server.share_utils import (
    new_share_token,
    parse_tracks_json,
    sum_track_durations,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["sets"])

MAX_CACHED_TRACKS = 120


class SavedSetUpsert(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    title: Optional[str] = Field(default=None, max_length=512)
    track_count: Optional[int] = Field(default=None, ge=0)
    duration_seconds: Optional[int] = Field(default=None, ge=0)
    tracks: Optional[List[dict]] = Field(default=None)


def _normalize_url(url: str) -> str:
    return url.strip()


def _row_to_read(row: SavedSet) -> SavedSetRead:
    return SavedSetRead(
        id=row.id,
        url=row.url,
        title=row.title,
        track_count=row.track_count,
        duration_seconds=row.duration_seconds,
        tracks_json=row.tracks_json,
        saved_at=row.saved_at,
        updated_at=row.updated_at,
        share_token=row.share_token,
    )


@router.get("/sets", response_model=List[SavedSetRead])
def list_sets(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    statement = (
        select(SavedSet)
        .where(SavedSet.user_id == current_user.id)
        .order_by(SavedSet.updated_at.desc())  # type: ignore[attr-defined]
    )
    return [_row_to_read(r) for r in session.exec(statement).all()]


@router.post("/sets", response_model=SavedSetRead)
def upsert_set(
    body: SavedSetUpsert,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    url = _normalize_url(body.url)
    if not url:
        raise HTTPException(status_code=400, detail="URL required")

    existing = session.exec(
        select(SavedSet).where(SavedSet.user_id == current_user.id, SavedSet.url == url)
    ).first()

    tracks_json = None
    track_count = body.track_count
    duration_seconds = body.duration_seconds

    if body.tracks is not None:
        trimmed = body.tracks[:MAX_CACHED_TRACKS]
        tracks_json = json.dumps(trimmed)
        track_count = len(trimmed)
        duration_seconds = sum_track_durations(trimmed)
    elif existing and track_count is None:
        prev = parse_tracks_json(existing.tracks_json)
        track_count = existing.track_count or len(prev)
        duration_seconds = existing.duration_seconds or sum_track_durations(prev)

    now = datetime.now(timezone.utc)

    if existing:
        if body.title:
            existing.title = body.title.strip()[:512]
        if tracks_json is not None:
            existing.tracks_json = tracks_json
        if track_count is not None:
            existing.track_count = track_count
        if duration_seconds is not None:
            existing.duration_seconds = duration_seconds
        existing.updated_at = now
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return _row_to_read(existing)

    title = (body.title or "DJ set").strip()[:512] or "DJ set"
    row = SavedSet(
        user_id=current_user.id,
        url=url,
        title=title,
        track_count=track_count or 0,
        duration_seconds=duration_seconds or 0,
        tracks_json=tracks_json or "[]",
        saved_at=now,
        updated_at=now,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _row_to_read(row)


@router.delete("/sets/{set_id}")
def delete_set(
    set_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    row = session.exec(
        select(SavedSet).where(SavedSet.id == set_id, SavedSet.user_id == current_user.id)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Set not found")
    session.delete(row)
    session.commit()
    return {"ok": True}


@router.post("/sets/{set_id}/share")
def share_set(
    set_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    row = session.exec(
        select(SavedSet).where(SavedSet.id == set_id, SavedSet.user_id == current_user.id)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Set not found")
    if not row.share_token:
        for _ in range(8):
            token = new_share_token()
            clash = session.exec(
                select(SavedSet).where(SavedSet.share_token == token)
            ).first()
            if not clash:
                row.share_token = token
                break
        else:
            raise HTTPException(status_code=500, detail="Could not allocate share token")
        session.add(row)
        session.commit()
        session.refresh(row)
    return {"token": row.share_token, "path": f"/s/{row.share_token}"}


def _resolve_sources(provider: str | None) -> tuple[str, ...]:
    if provider in ("youtube", "soundcloud"):
        return (provider,)
    return ("youtube", "soundcloud")


@router.get("/sets/search")
async def search_sets_endpoint(
    q: str,
    limit: int = 12,
    provider: str | None = None,
    current_user: User = Depends(get_current_user),
):
    """Search YouTube + SoundCloud for DJ sets/mixes (Set Browser search).

    `provider` restricts to one platform (youtube|soundcloud) -- used when
    the "uploaded within" filter is active, since only SoundCloud's search
    exposes a real upload timestamp.
    """
    q = q.strip()
    if not q:
        return {"results": []}
    limit = max(1, min(limit, 48))
    results = await asyncio.to_thread(search_sets, q, limit, _resolve_sources(provider))
    return {"results": results}


@router.get("/sets/quick-tracklist")
async def quick_tracklist_endpoint(
    url: str,
    current_user: User = Depends(get_current_user),
):
    """Fast tracklist from the video/track description — no audio analysis.

    Returns source="description" with matched tracks when the uploader already
    listed a tracklist with timestamps; source="none" otherwise (the caller should
    fall back to the slower Shazam-based /api/jobs analyze_set flow).
    """
    url = _normalize_url(url)
    if not url:
        raise HTTPException(status_code=400, detail="URL required")
    try:
        info = await asyncio.to_thread(fetch_set_info, url)
    except Exception as exc:
        logger.info("quick_tracklist: fetch_set_info failed for %s: %s", url, exc)
        raise HTTPException(status_code=502, detail="Could not read set info") from exc

    rows = parse_tracklist_from_description(info.get("description") or "")
    if not rows:
        return {
            "source": "none",
            "title": info.get("title"),
            "duration_seconds": info.get("duration_seconds"),
            "thumbnail": info.get("thumbnail"),
            "tracks": [],
        }

    matches = await asyncio.gather(
        *[match_tidal_track(row["artist"], row["title"]) for row in rows]
    )
    tracks = [
        {**row, "matched_track": match}
        for row, match in zip(rows, matches)
    ]
    return {
        "source": "description",
        "title": info.get("title"),
        "duration_seconds": info.get("duration_seconds"),
        "thumbnail": info.get("thumbnail"),
        "tracks": tracks,
    }


async def _blend_queries(
    queries: list[str],
    limit: int,
    exclude: set[str],
    sources: tuple[str, ...] = ("youtube", "soundcloud"),
) -> list[dict]:
    """Run several search queries in parallel and interleave them round-robin
    (instead of exhausting one query first) so the result reads like a radio
    blend rather than "query 1's results, then maybe some of query 2's"."""
    if len(sources) == 1:
        # Single-source (date-filter-scoped) calls: search_sets already pulls
        # a big pool (up to 200) per query, but only recency-*weighted* (not
        # date-guaranteed) relevance ranking decides what survives its own
        # internal truncation to `limit`. With N queries splitting a small
        # blended `limit` N ways, each query's slice was too thin for any
        # genuinely-recent item to survive that ranking before the caller's
        # hard date cutoff ever saw it -- results looked empty even though
        # recent sets existed in the fetched pool. Let each query keep far
        # more of its own pool so the date filter has real candidates.
        per_query = max(limit, 40)
    else:
        per_query = max(4, (limit // max(1, len(queries))) + 2)
    batches = await asyncio.gather(
        *[asyncio.to_thread(search_sets, q, per_query, sources) for q in queries]
    )
    if len(sources) == 1:
        # Date-filter-scoped: each batch is still ordered by search_sets's own
        # relevance*recency-weighted score, not by date -- so row_idx 0 of a
        # batch can easily be an old, highly-relevant result. Re-sorting each
        # batch by upload_timestamp before the round-robin below means row_idx
        # 0..k across all queries are each query's MOST recent items, so the
        # final `blended[:limit]` truncation is the one that actually decides
        # what's recent, instead of discarding recent items that happened to
        # rank low within their own query before the caller ever sees them.
        batches = [
            sorted(batch, key=lambda row: row.get("upload_timestamp") or 0, reverse=True)
            for batch in batches
        ]
    seen = set(exclude)
    blended: list[dict] = []
    for row_idx in range(per_query):
        for batch in batches:
            if row_idx >= len(batch):
                continue
            row = batch[row_idx]
            key = _normalize_url(row["url"])
            if key in seen:
                continue
            seen.add(key)
            blended.append(row)
    return blended[:limit]


@router.get("/sets/radio")
async def set_radio_endpoint(
    url: str,
    limit: int = 12,
    current_user: User = Depends(get_current_user),
):
    """'Similar sets' / radio-by-set — a blended mix (same artist, same
    genre/style, same event), like track radio, not just "more from this DJ"."""
    url = _normalize_url(url)
    if not url:
        raise HTTPException(status_code=400, detail="URL required")
    limit = max(1, min(limit, 20))
    try:
        info = await asyncio.to_thread(fetch_set_info, url)
    except Exception as exc:
        logger.info("set_radio: fetch_set_info failed for %s: %s", url, exc)
        raise HTTPException(status_code=502, detail="Could not read set info") from exc

    queries = build_similar_queries(info.get("title") or "", info.get("channel") or "")
    blended = await _blend_queries(queries, limit, exclude={url})
    return {"queries": queries, "results": blended}


# Generic queries used when a user has no liked tracks yet (or none with a
# usable artist name) — rotated randomly so reloading the empty state doesn't
# always show the exact same sets.
_FALLBACK_DISCOVER_QUERIES = [
    "boiler room dj set",
    "tomorrowland dj set",
    "afro house dj set",
    "tech house dj set",
    "melodic techno dj set",
    "deep house dj set",
    "house dj set",
    "organic house dj set",
    "hard techno dj set",
    "amapiano dj set",
    "drum and bass dj set",
    "progressive house dj set",
]

# Brand/venue/festival queries ("boiler room dj set", "tomorrowland dj set")
# get swamped by their own all-time-classic uploads on SoundCloud (verified
# empirically: 0/40 results within 30 days for either, vs. 3-11/40 for every
# plain genre query below) -- their popularity means the same decade-old
# viral sets always outrank anything actually recent, so no amount of
# recency-sorting the fetched pool can help once the date filter is active.
# Excluded from the date-filtered discovery pool only; they're fine (in fact
# good) for the unfiltered personalized-discovery case above.
_RECENT_FALLBACK_DISCOVER_QUERIES = [
    q for q in _FALLBACK_DISCOVER_QUERIES if "boiler room" not in q and "tomorrowland" not in q
]


def _library_artist_names(session: Session, user_id: int, limit: int = 60) -> list[str]:
    rows = session.exec(
        select(SavedTrack)
        .where(SavedTrack.user_id == user_id)
        .order_by(SavedTrack.added_at.desc())  # type: ignore[attr-defined]
        .limit(limit)
    ).all()
    names: list[str] = []
    seen: set[str] = set()
    for row in rows:
        try:
            artists = json.loads(row.artists_json or "[]")
        except (TypeError, ValueError):
            artists = []
        for name in artists:
            key = str(name).strip().lower()
            if name and key not in seen:
                seen.add(key)
                names.append(str(name).strip())
    return names


@router.get("/sets/recommendations")
async def set_recommendations_endpoint(
    limit: int = 12,
    provider: str | None = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Sets to discover without typing a query — like the track Recommendations
    page, seeded from artists in the user's library and blended radio-style.

    Only 3 artists got queried before, so whenever the same 2-3 big names got
    sampled, the whole grid was just "several sets by exactly those people" —
    round-robin blending across only 3 queries is inherently that repetitive.
    Sampling more distinct artists, and mixing in several genre/event
    discovery queries alongside them, spreads results across more than just
    the user's own top few favorites.
    """
    limit = max(1, min(limit, 48))
    assert current_user.id is not None

    # Each query costs a real (slow, sometimes YouTube-rate-limited) yt-dlp
    # search -- production logs showed this endpoint occasionally taking
    # 10-50+ seconds with the old 11-query fan-out, blowing past the
    # frontend's request timeout and silently rendering an empty grid (the
    # fetch failure is swallowed). Cache the built list per (user, provider,
    # limit) for rec_cache's TTL so repeat visits/refetches are instant.
    cache_key = f"sets:{current_user.id}:{provider or 'all'}"
    cached = rec_cache.cache_get(cache_key, limit)
    if cached is not None:
        return {"queries": [], "results": cached}

    # A specific artist's own upload volume in any given recent window is
    # usually thin (someone you like might post a new set every few months),
    # while a general genre query has far more monthly SoundCloud volume --
    # so once the date filter is active (provider scoped to SoundCloud),
    # lean genre-heavy instead of artist-heavy to actually surface enough
    # results, at some cost to personalization.
    date_filtered = provider is not None
    artist_count = 3 if date_filtered else 6
    genre_count = 6 if date_filtered else 5
    genre_pool = _RECENT_FALLBACK_DISCOVER_QUERIES if date_filtered else _FALLBACK_DISCOVER_QUERIES
    artist_names = _library_artist_names(session, current_user.id)
    if artist_names:
        picked = random.sample(artist_names, min(artist_count, len(artist_names)))
        queries = [f"{name} dj set" for name in picked]
        queries += random.sample(genre_pool, min(genre_count, len(genre_pool)))
    else:
        queries = random.sample(genre_pool, min(8, len(genre_pool)))

    blended = await _blend_queries(queries, limit, exclude=set(), sources=_resolve_sources(provider))
    rec_cache.cache_set(cache_key, limit, blended)
    return {"queries": queries, "results": blended}


@router.head("/sets/cached-audio", operation_id="head_cached_set_audio")
@router.get("/sets/cached-audio", operation_id="get_cached_set_audio")
def stream_cached_set_audio(
    url: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Stream MP3 cached during analyze_set (same timeline as Shazam timestamps)."""
    normalized = _normalize_url(url)
    if not normalized:
        raise HTTPException(status_code=400, detail="URL required")
    if not has_cached_set_audio(normalized):
        raise HTTPException(status_code=404, detail="Cached set audio not found")
    if request.method == "HEAD":
        return Response(status_code=200, media_type="audio/mpeg")
    path = cache_path(normalized)
    return FileResponse(path, media_type="audio/mpeg", filename="set.mp3")
