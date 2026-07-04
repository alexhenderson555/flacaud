"""DB helpers for per-user connected accounts: upsert, load, decrypt, refresh, purge."""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Optional

from sqlmodel import Session, select

from tidal_dl_ru.database.models import ConnectedAccount, _utcnow
from tidal_dl_ru.providers.user_library import AccountAuth, TokenBundle, UserLibraryConnector
from tidal_dl_ru.server.oauth_crypto import decrypt_token, encrypt_token


def get_account(session: Session, user_id: int, provider: str) -> Optional[ConnectedAccount]:
    return session.exec(
        select(ConnectedAccount).where(
            ConnectedAccount.user_id == user_id,
            ConnectedAccount.provider == provider,
        )
    ).first()


def list_user_providers(session: Session, user_id: int) -> set[str]:
    rows = session.exec(
        select(ConnectedAccount.provider).where(ConnectedAccount.user_id == user_id)
    ).all()
    return {r for r in rows}


def upsert_account(
    session: Session,
    user_id: int,
    provider: str,
    bundle: TokenBundle,
) -> ConnectedAccount:
    row = get_account(session, user_id, provider)
    expires_at = _utcnow() + timedelta(seconds=bundle.expires_in) if bundle.expires_in else None
    scopes_json = json.dumps(bundle.scopes) if bundle.scopes else None
    if row is None:
        row = ConnectedAccount(user_id=user_id, provider=provider)
    row.provider_account_id = bundle.account_id or row.provider_account_id
    row.display_name = bundle.display_name or row.display_name
    row.access_token_enc = encrypt_token(bundle.access_token)
    if bundle.refresh_token:
        row.refresh_token_enc = encrypt_token(bundle.refresh_token)
    row.expires_at = expires_at
    row.scopes = scopes_json
    row.connected_at = row.connected_at or _utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def delete_account(session: Session, user_id: int, provider: str) -> bool:
    row = get_account(session, user_id, provider)
    if row is None:
        return False
    session.delete(row)
    session.commit()
    return True


def delete_all_for_user(session: Session, user_id: int) -> int:
    rows = session.exec(
        select(ConnectedAccount).where(ConnectedAccount.user_id == user_id)
    ).all()
    for row in rows:
        session.delete(row)
    if rows:
        session.commit()
    return len(rows)


def _is_expired(row: ConnectedAccount) -> bool:
    if not row.expires_at:
        return False
    from datetime import timezone

    exp = row.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    # Refresh a minute early to avoid mid-request expiry.
    return exp <= _utcnow() + timedelta(seconds=60)


def account_auth(
    session: Session,
    row: ConnectedAccount,
    connector: UserLibraryConnector,
) -> AccountAuth:
    """Decrypt tokens; refresh the access token if expired and the connector supports it."""
    auth = AccountAuth(
        access_token=decrypt_token(row.access_token_enc),
        refresh_token=decrypt_token(row.refresh_token_enc),
        account_id=row.provider_account_id,
    )
    if _is_expired(row) and auth.refresh_token:
        refreshed = connector.refresh(auth)
        if refreshed and refreshed.access_token:
            assert row.user_id is not None
            updated = upsert_account(session, row.user_id, row.provider, refreshed)
            auth = AccountAuth(
                access_token=decrypt_token(updated.access_token_enc),
                refresh_token=decrypt_token(updated.refresh_token_enc),
                account_id=updated.provider_account_id,
            )
    row.last_used_at = _utcnow()
    session.add(row)
    session.commit()
    return auth
