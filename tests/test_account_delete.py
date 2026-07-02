"""Tests for GDPR-style account deletion."""

from datetime import datetime, timezone

from sqlmodel import Session, SQLModel, create_engine, select

from tidal_dl_ru.database.models import (
    Playlist,
    PlaylistTrack,
    SavedSet,
    SavedTrack,
    TransferMatchRule,
    User,
)


def _make_engine(tmp_path):
    db = tmp_path / "acct_del.db"
    engine = create_engine(f"sqlite:///{db.as_posix()}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine


def test_delete_user_account_purges_all_owned_rows(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)

    # stub refresh token revocation so it doesn't touch Redis
    import tidal_dl_ru.server.account_delete as mod

    revoked: list[int] = []
    monkeypatch.setattr(
        mod,
        "revoke_all_refresh_sessions_for_user",
        lambda session, uid: revoked.append(uid),
    )

    with Session(engine) as session:
        user = User(username="deleteme", email="dm@t.local", plan="free")
        session.add(user)
        session.commit()
        session.refresh(user)
        uid = user.id

        playlist = Playlist(user_id=uid, name="MyPlaylist")
        session.add(playlist)
        session.commit()
        session.refresh(playlist)

        session.add(PlaylistTrack(playlist_id=playlist.id, position=0, provider="tidal", provider_id="t1", title="Track A"))
        session.add(SavedTrack(user_id=uid, provider="tidal", provider_id="t1", title="Saved Track", artists_json="[]"))
        session.add(SavedSet(user_id=uid, url="https://example.test/set1", title="Set1"))
        session.add(TransferMatchRule(user_id=uid, source_platform="spotify", source_title="foo"))
        session.commit()

    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == "deleteme")).first()
        mod.delete_user_account(session, user)

    assert uid in revoked

    with Session(engine) as session:
        assert session.exec(select(User).where(User.id == uid)).first() is None
        assert session.exec(select(Playlist).where(Playlist.user_id == uid)).first() is None
        assert session.exec(select(PlaylistTrack)).first() is None
        assert session.exec(select(SavedTrack).where(SavedTrack.user_id == uid)).first() is None
        assert session.exec(select(SavedSet).where(SavedSet.user_id == uid)).first() is None
        assert session.exec(select(TransferMatchRule).where(TransferMatchRule.user_id == uid)).first() is None


def test_delete_user_with_no_associated_data(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.account_delete as mod

    monkeypatch.setattr(mod, "revoke_all_refresh_sessions_for_user", lambda s, uid: None)

    with Session(engine) as session:
        user = User(username="lonely", plan="free")
        session.add(user)
        session.commit()
        session.refresh(user)
        mod.delete_user_account(session, user)

    with Session(engine) as session:
        assert session.exec(select(User).where(User.username == "lonely")).first() is None


def test_delete_user_does_not_touch_other_users(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path)
    import tidal_dl_ru.server.account_delete as mod

    monkeypatch.setattr(mod, "revoke_all_refresh_sessions_for_user", lambda s, uid: None)

    with Session(engine) as session:
        u1 = User(username="keep", email="keep@t.local", plan="free")
        u2 = User(username="delete", email="del@t.local", plan="free")
        session.add_all([u1, u2])
        session.commit()
        session.refresh(u1)
        session.refresh(u2)
        keep_uid = u1.id

        session.add(SavedTrack(user_id=keep_uid, provider="tidal", provider_id="t1", title="KeepTrack", artists_json="[]"))
        session.commit()

        mod.delete_user_account(session, u2)

    with Session(engine) as session:
        assert session.exec(select(User).where(User.username == "keep")).first() is not None
        assert session.exec(select(SavedTrack).where(SavedTrack.user_id == keep_uid)).first() is not None
