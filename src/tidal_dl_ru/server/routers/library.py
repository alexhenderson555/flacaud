from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from typing import List

from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import User, SavedTrack, Playlist, SavedTrackBase, PlaylistBase
from tidal_dl_ru.database.auth import get_current_user

router = APIRouter(prefix="/api", tags=["library"])

@router.get("/library", response_model=List[SavedTrack])
def get_library(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return current_user.saved_tracks

@router.post("/library", response_model=SavedTrack)
def add_to_library(track: SavedTrackBase, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    db_track = SavedTrack(**track.model_dump(), user_id=current_user.id)
    session.add(db_track)
    session.commit()
    session.refresh(db_track)
    return db_track

@router.delete("/library/{track_id}")
def remove_from_library(track_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    track = session.query(SavedTrack).filter(SavedTrack.id == track_id, SavedTrack.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    session.delete(track)
    session.commit()
    return {"ok": True}

@router.get("/playlists", response_model=List[Playlist])
def get_playlists(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return current_user.playlists

@router.post("/playlists", response_model=Playlist)
def create_playlist(playlist: PlaylistBase, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    db_playlist = Playlist(name=playlist.name, user_id=current_user.id)
    session.add(db_playlist)
    session.commit()
    session.refresh(db_playlist)
    return db_playlist

@router.put("/playlists/{playlist_id}")
def update_playlist(playlist_id: int, tracks_json: str, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    playlist = session.query(Playlist).filter(Playlist.id == playlist_id, Playlist.user_id == current_user.id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    playlist.tracks_json = tracks_json
    session.commit()
    session.refresh(playlist)
    return playlist

@router.delete("/playlists/{playlist_id}")
def delete_playlist(playlist_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    playlist = session.query(Playlist).filter(Playlist.id == playlist_id, Playlist.user_id == current_user.id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    session.delete(playlist)
    session.commit()
    return {"ok": True}
