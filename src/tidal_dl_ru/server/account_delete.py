"""GDPR-style account deletion — purge user-owned rows."""

from __future__ import annotations

from sqlmodel import Session, select

from tidal_dl_ru.database.models import (
    ConnectedAccount,
    Playlist,
    PlaylistTrack,
    SavedSet,
    SavedTrack,
    TransferMatchRule,
    User,
)
from tidal_dl_ru.database.refresh_tokens import revoke_all_refresh_sessions_for_user


def delete_user_account(session: Session, user: User) -> None:
    """Delete playlists, library, sets, rules, refresh sessions, then the user."""
    assert user.id is not None
    playlists = session.exec(select(Playlist).where(Playlist.user_id == user.id)).all()
    for playlist in playlists:
        rows = session.exec(
            select(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist.id)
        ).all()
        for row in rows:
            session.delete(row)
        session.delete(playlist)

    for track in session.exec(select(SavedTrack).where(SavedTrack.user_id == user.id)).all():
        session.delete(track)

    for saved_set in session.exec(select(SavedSet).where(SavedSet.user_id == user.id)).all():
        session.delete(saved_set)

    for rule in session.exec(
        select(TransferMatchRule).where(TransferMatchRule.user_id == user.id)
    ).all():
        session.delete(rule)

    for account in session.exec(
        select(ConnectedAccount).where(ConnectedAccount.user_id == user.id)
    ).all():
        session.delete(account)

    revoke_all_refresh_sessions_for_user(session, user.id)
    session.delete(user)
    session.commit()
