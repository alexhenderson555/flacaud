import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import Playlist, PlaylistTrack, SavedSet, User
from tidal_dl_ru.server.share_utils import (
    new_share_token,
    parse_tracks_json,
    sum_track_durations,
)

router = APIRouter(prefix="/api", tags=["share"])

MAX_PREVIEW = 8


def _merge_playlist_tracks_json(existing_json: str, incoming_json: str) -> str:
    existing = parse_tracks_json(existing_json)
    incoming = parse_tracks_json(incoming_json)
    def _track_key(tr: dict) -> str:
        pid = tr.get("provider_id")
        if not pid:
            return ""
        provider = tr.get("provider") or "tidal"
        return f"{provider}:{pid}"

    seen = {_track_key(t) for t in existing if _track_key(t)}
    combined = list(existing)
    for tr in incoming:
        key = _track_key(tr)
        if key and key not in seen:
            combined.append(tr)
            seen.add(key)
    return json.dumps(combined)


class SharePreview(BaseModel):
    kind: str
    title: str
    track_count: int
    duration_seconds: int
    preview_tracks: List[dict] = Field(default_factory=list)
    owner_username: Optional[str] = None


class ShareClaimResult(BaseModel):
    ok: bool
    kind: str
    title: str
    id: Optional[int] = None
    already_had: bool = False


def _find_by_token(session: Session, token: str) -> tuple[str, Playlist | SavedSet] | None:
    t = token.strip()
    if not t:
        return None
    pl = session.exec(select(Playlist).where(Playlist.share_token == t)).first()
    if pl:
        return ("playlist", pl)
    ss = session.exec(select(SavedSet).where(SavedSet.share_token == t)).first()
    if ss:
        return ("set", ss)
    return None


def _owner_name(session: Session, user_id: int) -> Optional[str]:
    user = session.get(User, user_id)
    if not user:
        return None
    return user.username or user.email


@router.get("/share/{token}", response_model=SharePreview)
def get_share_preview(token: str, session: Session = Depends(get_session)):
    found = _find_by_token(session, token)
    if not found:
        raise HTTPException(status_code=404, detail="Share link not found or expired")

    kind, row = found
    if kind == "playlist":
        track_rows = session.exec(
            select(PlaylistTrack)
            .where(PlaylistTrack.playlist_id == row.id)
            .order_by(PlaylistTrack.position)
        ).all()
        tracks = [
            {
                "provider": tr.provider,
                "provider_id": tr.provider_id,
                "title": tr.title,
                "artists": json.loads(tr.artists_json),
                "album": tr.album,
                "duration_s": tr.duration_s,
                "cover_url": tr.cover_url,
                "quality": tr.quality,
            }
            for tr in track_rows
        ]
        return SharePreview(
            kind="playlist",
            title=row.name,
            track_count=len(tracks),
            duration_seconds=sum_track_durations(tracks),
            preview_tracks=tracks[:MAX_PREVIEW],
            owner_username=_owner_name(session, row.user_id),
        )

    tracks = parse_tracks_json(row.tracks_json)
    count = row.track_count or len(tracks)
    duration = row.duration_seconds or sum_track_durations(tracks)
    return SharePreview(
        kind="set",
        title=row.title,
        track_count=count,
        duration_seconds=duration,
        preview_tracks=tracks[:MAX_PREVIEW],
        owner_username=_owner_name(session, row.user_id),
    )


@router.post("/share/{token}/claim", response_model=ShareClaimResult)
def claim_share(
    token: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    found = _find_by_token(session, token)
    if not found:
        raise HTTPException(status_code=404, detail="Share link not found or expired")

    kind, source = found
    now = datetime.now(timezone.utc)

    if kind == "playlist":
        if source.user_id == current_user.id:
            return ShareClaimResult(ok=True, kind="playlist", title=source.name, id=source.id, already_had=True)

        base_name = source.name.strip() or "Shared playlist"
        existing = session.exec(
            select(Playlist).where(
                Playlist.user_id == current_user.id,
                Playlist.name == base_name,
            )
        ).first()

        track_rows = session.exec(
            select(PlaylistTrack)
            .where(PlaylistTrack.playlist_id == source.id)
            .order_by(PlaylistTrack.position)
        ).all()
        incoming_tracks = [
            {
                "provider": tr.provider,
                "provider_id": tr.provider_id,
                "title": tr.title,
                "artists": json.loads(tr.artists_json),
                "album": tr.album,
                "duration_s": tr.duration_s,
                "cover_url": tr.cover_url,
                "quality": tr.quality,
            }
            for tr in track_rows
        ]

        if existing:
            from tidal_dl_ru.server.playlist_tracks import sync_playlist_tracks
            existing_track_rows = session.exec(
                select(PlaylistTrack)
                .where(PlaylistTrack.playlist_id == existing.id)
                .order_by(PlaylistTrack.position)
            ).all()
            existing_tracks = [
                {
                    "provider": tr.provider,
                    "provider_id": tr.provider_id,
                    "title": tr.title,
                    "artists": json.loads(tr.artists_json),
                    "album": tr.album,
                    "duration_s": tr.duration_s,
                    "cover_url": tr.cover_url,
                    "quality": tr.quality,
                }
                for tr in existing_track_rows
            ]

            merged_str = _merge_playlist_tracks_json(json.dumps(existing_tracks), json.dumps(incoming_tracks))
            merged = json.loads(merged_str)
            already_had = len(merged) == len(existing_tracks)
            if not already_had:
                sync_playlist_tracks(session, existing, merged)
                session.commit()
                session.refresh(existing)
            return ShareClaimResult(
                ok=True,
                kind="playlist",
                title=existing.name,
                id=existing.id,
                already_had=already_had,
            )

        pl = Playlist(
            name=base_name,
            user_id=current_user.id,
            created_at=now,
        )
        session.add(pl)
        session.flush()
        from tidal_dl_ru.server.playlist_tracks import sync_playlist_tracks
        sync_playlist_tracks(session, pl, incoming_tracks)
        session.commit()
        session.refresh(pl)
        return ShareClaimResult(ok=True, kind="playlist", title=pl.name, id=pl.id)

    # set
    if source.user_id == current_user.id:
        return ShareClaimResult(ok=True, kind="set", title=source.title, id=source.id, already_had=True)

    dup = session.exec(
        select(SavedSet).where(SavedSet.user_id == current_user.id, SavedSet.url == source.url)
    ).first()
    if dup:
        updated = False
        if source.track_count > dup.track_count or len(source.tracks_json) > len(dup.tracks_json or ""):
            dup.title = source.title
            dup.track_count = source.track_count
            dup.duration_seconds = source.duration_seconds
            dup.tracks_json = source.tracks_json
            dup.updated_at = now
            session.add(dup)
            session.commit()
            session.refresh(dup)
            updated = True
        return ShareClaimResult(
            ok=True,
            kind="set",
            title=dup.title,
            id=dup.id,
            already_had=not updated,
        )

    row = SavedSet(
        user_id=current_user.id,
        url=source.url,
        title=source.title,
        track_count=source.track_count,
        duration_seconds=source.duration_seconds,
        tracks_json=source.tracks_json,
        saved_at=now,
        updated_at=now,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return ShareClaimResult(ok=True, kind="set", title=row.title, id=row.id)


@router.post("/playlists/{playlist_id}/share")
def share_playlist(
    playlist_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    pl = session.exec(
        select(Playlist).where(Playlist.id == playlist_id, Playlist.user_id == current_user.id)
    ).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not pl.share_token:
        for _ in range(8):
            token = new_share_token()
            clash_pl = session.exec(select(Playlist).where(Playlist.share_token == token)).first()
            clash_set = session.exec(select(SavedSet).where(SavedSet.share_token == token)).first()
            if not clash_pl and not clash_set:
                pl.share_token = token
                break
        else:
            raise HTTPException(status_code=500, detail="Could not allocate share token")
        session.add(pl)
        session.commit()
        session.refresh(pl)
    return {"token": pl.share_token, "path": f"/s/{pl.share_token}"}
