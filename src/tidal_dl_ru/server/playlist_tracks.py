"""Dual-write playlist tracks to normalized rows."""

from __future__ import annotations

import json

from sqlmodel import Session, delete

from tidal_dl_ru.database.models import Playlist, PlaylistTrack


def sync_playlist_tracks(session: Session, playlist: Playlist, tracks_payload: list[dict]) -> None:
    """Replace normalized rows for a playlist (keeps tracks_json as source of truth)."""
    session.exec(delete(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist.id))  # type: ignore[arg-type]
    for pos, row in enumerate(tracks_payload):
        artists = row.get("artists") or []
        session.add(
            PlaylistTrack(
                playlist_id=playlist.id,
                position=pos,
                provider=(row.get("provider") or "tidal").lower(),
                provider_id=str(row.get("provider_id") or ""),
                title=str(row.get("title") or "Untitled"),
                artists_json=json.dumps(artists),
                album=row.get("album"),
                duration_s=row.get("duration_s") or row.get("duration"),
                cover_url=row.get("cover_url"),
                quality=row.get("quality"),
            )
        )
    session.flush()
