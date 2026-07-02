import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from tidal_dl_ru.core.set_audio_cache import cache_path, has_cached_set_audio
from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import SavedSet, SavedSetRead, User
from tidal_dl_ru.server.share_utils import (
    new_share_token,
    parse_tracks_json,
    sum_track_durations,
)

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


@router.api_route("/sets/cached-audio", methods=["GET", "HEAD"])
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
