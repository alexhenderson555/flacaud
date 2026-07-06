"""Connected-account OAuth framework: crypto, state, storage, refresh, GDPR."""

from datetime import timedelta

from sqlmodel import Session

from tidal_dl_ru.database import database as db_mod
from tidal_dl_ru.database.models import ConnectedAccount, User, _utcnow
from tidal_dl_ru.providers.user_library import (
    AccountAuth,
    TokenBundle,
    all_connectors,
    ensure_connectors_loaded,
    get_connector,
)
from tidal_dl_ru.server import connected_accounts_service as svc
from tidal_dl_ru.server.oauth_crypto import (
    decrypt_token,
    encrypt_token,
    sign_state,
    verify_state,
)


def _make_user() -> int:
    with Session(db_mod.engine) as session:
        u = User(username="acct_user", email="acct@test.local", hashed_password="x")
        session.add(u)
        session.commit()
        session.refresh(u)
        assert u.id is not None
        return u.id


def test_token_crypto_roundtrip():
    enc = encrypt_token("super-secret-refresh")
    assert enc and enc != "super-secret-refresh"
    assert decrypt_token(enc) == "super-secret-refresh"
    assert encrypt_token(None) is None
    assert decrypt_token(None) is None


def test_state_sign_verify():
    token = sign_state({"uid": 7, "provider": "spotify"})
    assert verify_state(token) == {"uid": 7, "provider": "spotify"}
    assert verify_state("tampered.token.value") is None


def test_dormant_connectors_report_not_configured():
    # No SPOTIPY_/GOOGLE_ creds in the test env → connectors present but dormant.
    ensure_connectors_loaded()
    providers = {c.provider for c in all_connectors()}
    assert {"spotify", "ytmusic"}.issubset(providers)
    for c in all_connectors():
        assert c.oauth_config().configured is False


def test_upsert_get_delete_account():
    uid = _make_user()
    with Session(db_mod.engine) as session:
        row = svc.upsert_account(
            session, uid, "spotify",
            TokenBundle(access_token="AT", refresh_token="RT", expires_in=3600,
                        scopes=["user-library-read"], account_id="spid", display_name="Me"),
        )
        assert row.id is not None
        assert row.access_token_enc and row.access_token_enc != "AT"
        assert decrypt_token(row.refresh_token_enc) == "RT"

        assert svc.list_user_providers(session, uid) == {"spotify"}

        # Upsert again updates in place (one row per user+provider).
        svc.upsert_account(session, uid, "spotify", TokenBundle(access_token="AT2"))
        assert svc.list_user_providers(session, uid) == {"spotify"}

        assert svc.delete_account(session, uid, "spotify") is True
        assert svc.get_account(session, uid, "spotify") is None


def test_account_auth_refreshes_when_expired():
    uid = _make_user()

    class FakeConnector:
        provider = "spotify"
        def refresh(self, auth: AccountAuth):
            assert auth.refresh_token == "RT"
            return TokenBundle(access_token="NEW_AT", refresh_token="RT", expires_in=3600)

    with Session(db_mod.engine) as session:
        row = svc.upsert_account(
            session, uid, "spotify",
            TokenBundle(access_token="OLD_AT", refresh_token="RT", expires_in=3600),
        )
        # Force expiry.
        row.expires_at = _utcnow() - timedelta(minutes=5)
        session.add(row)
        session.commit()

        auth = svc.account_auth(session, row, FakeConnector())
        assert auth.access_token == "NEW_AT"


def test_gdpr_delete_purges_connected_accounts():
    uid = _make_user()
    with Session(db_mod.engine) as session:
        svc.upsert_account(session, uid, "spotify", TokenBundle(access_token="AT"))
        user = session.get(User, uid)
        from tidal_dl_ru.server.account_delete import delete_user_account

        delete_user_account(session, user)

    with Session(db_mod.engine) as session:
        assert session.get(User, uid) is None
        assert svc.get_account(session, uid, "spotify") is None
