import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import Playlist, PlaylistBase, SavedTrack, SavedTrackBase, User

router = APIRouter(prefix="/api", tags=["library"])


class PlaylistTracksUpdate(BaseModel):
    tracks: List[dict] = Field(default_factory=list)


def _playlist_to_dict(p) -> dict:
    tracks = []
    for t in sorted(p.track_rows, key=lambda x: x.position):
        try:
            artists = json.loads(t.artists_json)
        except Exception:
            artists = []
        tracks.append({
            "provider": t.provider,
            "provider_id": t.provider_id,
            "title": t.title,
            "artists": artists,
            "album": t.album,
            "duration_s": t.duration_s,
            "cover_url": t.cover_url,
            "quality": t.quality,
        })
    d = p.model_dump()
    d["tracks_json"] = json.dumps(tracks)
    return d


class SavedTrackDjUpdate(BaseModel):
    bpm: int = Field(ge=40, le=250)
    camelot_key: str = Field(min_length=2, max_length=8)
    musical_key: Optional[str] = Field(default=None, max_length=24)


class SavedTrackMetaUpdate(BaseModel):
    artist_ids_json: Optional[str] = None
    album_id: Optional[str] = Field(default=None, max_length=32)
    release_date: Optional[str] = Field(default=None, max_length=16)
    cover_url: Optional[str] = Field(default=None, max_length=512)


@router.get("/library", response_model=List[SavedTrack])
def get_library(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    statement = (
        select(SavedTrack)
        .where(SavedTrack.user_id == current_user.id)
        .order_by(SavedTrack.added_at.desc())  # type: ignore[attr-defined]
    )
    return list(session.exec(statement).all())


@router.post("/library", response_model=SavedTrack)
def add_to_library(
    track: SavedTrackBase,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(SavedTrack).where(
            SavedTrack.user_id == current_user.id,
            SavedTrack.provider == track.provider,
            SavedTrack.provider_id == track.provider_id,
        )
    ).first()
    if existing:
        return existing

    db_track = SavedTrack(**track.model_dump(), user_id=current_user.id)
    session.add(db_track)
    session.commit()
    session.refresh(db_track)
    return db_track


@router.patch("/library/{track_id}/meta", response_model=SavedTrack)
def update_library_track_meta(
    track_id: int,
    body: SavedTrackMetaUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    track = session.exec(
        select(SavedTrack).where(SavedTrack.id == track_id, SavedTrack.user_id == current_user.id)
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if body.artist_ids_json is not None:
        track.artist_ids_json = body.artist_ids_json
    if body.album_id is not None:
        track.album_id = body.album_id
    if body.release_date is not None:
        track.release_date = body.release_date or None
    if body.cover_url is not None:
        track.cover_url = body.cover_url or None
    session.add(track)
    session.commit()
    session.refresh(track)
    return track


@router.patch("/library/{track_id}/dj", response_model=SavedTrack)
def update_library_dj_meta(
    track_id: int,
    body: SavedTrackDjUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    track = session.exec(
        select(SavedTrack).where(SavedTrack.id == track_id, SavedTrack.user_id == current_user.id)
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    track.bpm = body.bpm
    track.camelot_key = body.camelot_key.strip().upper()
    track.musical_key = body.musical_key
    session.add(track)
    session.commit()
    session.refresh(track)
    return track


@router.delete("/library/{track_id}")
def remove_from_library(
    track_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    track = session.exec(
        select(SavedTrack).where(SavedTrack.id == track_id, SavedTrack.user_id == current_user.id)
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    session.delete(track)
    session.commit()
    return {"ok": True}


@router.get("/transitions/{provider}/{provider_id}")
def find_track_transitions(
    provider: str,
    provider_id: str,
    bpm_tolerance: int = 6,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Rank the user's library by DJ transition compatibility with a seed track.

    Returns compatible tracks (those with bpm + camelot_key populated) scored
    by harmonic + BPM fit. Tracks without DJ analysis are skipped — the
    Transition Finder is most useful after the library has been analyzed.
    """
    from tidal_dl_ru.server.transitions import find_transitions

    if provider != "tidal":
        raise HTTPException(status_code=400, detail="Only tidal provider supported")
    limit = max(1, min(limit, 50))
    bpm_tolerance = max(0, min(bpm_tolerance, 50))

    saved = list(session.exec(
        select(SavedTrack).where(SavedTrack.user_id == current_user.id)
    ).all())
    return {
        "seed": str(provider_id),
        "tracks": find_transitions(
            saved, str(provider_id),
            bpm_tolerance=bpm_tolerance, limit=limit,
        ),
    }


@router.get("/playlists", response_model=List[dict])
def get_playlists(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    statement = (
        select(Playlist)
        .where(Playlist.user_id == current_user.id)
        .order_by(Playlist.created_at.desc())  # type: ignore[attr-defined]
    )
    return [_playlist_to_dict(p) for p in session.exec(statement).all()]


@router.post("/playlists", response_model=dict)
def create_playlist(
    playlist: PlaylistBase,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    db_playlist = Playlist(name=playlist.name, user_id=current_user.id)
    session.add(db_playlist)
    session.commit()
    session.refresh(db_playlist)
    return _playlist_to_dict(db_playlist)


@router.put("/playlists/{playlist_id}", response_model=dict)
def update_playlist(
    playlist_id: int,
    body: PlaylistTracksUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    playlist = session.exec(
        select(Playlist).where(Playlist.id == playlist_id, Playlist.user_id == current_user.id)
    ).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    from tidal_dl_ru.server.playlist_tracks import sync_playlist_tracks
    sync_playlist_tracks(session, playlist, body.tracks)
    session.add(playlist)
    session.commit()
    session.refresh(playlist)
    return _playlist_to_dict(playlist)


@router.delete("/playlists/{playlist_id}")
def delete_playlist(
    playlist_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    playlist = session.exec(
        select(Playlist).where(Playlist.id == playlist_id, Playlist.user_id == current_user.id)
    ).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    session.delete(playlist)
    session.commit()
    return {"ok": True}
