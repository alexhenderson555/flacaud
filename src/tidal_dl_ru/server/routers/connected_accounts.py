"""Per-user connected-account OAuth: connect external platforms and import their
private playlists / liked songs into the Tidal library, reusing the transfer match
pipeline. See providers/user_library.py for the connector contract."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlmodel import Session

from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.database.models import User
from tidal_dl_ru.providers.base import ProviderError
from tidal_dl_ru.providers.user_library import (
    ConnectorNotConfigured,
    all_connectors,
    ensure_connectors_loaded,
    get_connector,
)
from tidal_dl_ru.server import connected_accounts_service as svc
from tidal_dl_ru.server.oauth_crypto import sign_state, verify_state
from tidal_dl_ru.server.settings import settings
from tidal_dl_ru.server.transfer_service import (
    create_playlist_from_tracks,
    import_tracks_to_library,
    preview_dict_from_result,
    resolve_from_source_tracks,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/connected-accounts", tags=["connected-accounts"])


def _redirect_uri(provider: str) -> str:
    return f"{settings.public_base_url}/api/connected-accounts/{provider}/callback"


def _require_connector(provider: str):
    ensure_connectors_loaded()
    connector = get_connector(provider)
    if connector is None:
        raise HTTPException(status_code=404, detail=f"Unknown provider '{provider}'")
    return connector


# --- Listing ----------------------------------------------------------------

@router.get("")
def list_connected_accounts(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_connectors_loaded()
    assert current_user.id is not None
    linked = svc.list_user_providers(session, current_user.id)
    out = []
    for c in all_connectors():
        cfg = c.oauth_config()
        out.append({
            "provider": c.provider,
            "display_name": c.display_name,
            "flow": cfg.flow,
            "configured": cfg.configured,
            "unofficial": cfg.unofficial,
            "note": cfg.note,
            "connected": c.provider in linked,
        })
    return {"accounts": out}


# --- Connect (start flow) ---------------------------------------------------

@router.post("/{provider}/authorize")
def authorize(
    provider: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    connector = _require_connector(provider)
    cfg = connector.oauth_config()
    if not cfg.configured:
        raise HTTPException(status_code=409, detail=f"{connector.display_name} is not configured on the server yet.")
    assert current_user.id is not None
    try:
        if cfg.flow == "redirect":
            state = sign_state({"uid": current_user.id, "provider": provider})
            url = connector.build_authorize_url(state=state, redirect_uri=_redirect_uri(provider))
            return {"flow": "redirect", "authorization_url": url}
        if cfg.flow == "device":
            dev = connector.begin_device()
            return {
                "flow": "device",
                "device_code": dev.device_code,
                "user_code": dev.user_code,
                "verification_url": dev.verification_url,
                "interval": dev.interval,
                "expires_in": dev.expires_in,
            }
        return {"flow": "token", "note": cfg.note or "Follow the instructions to paste a token."}
    except ConnectorNotConfigured as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("authorize failed for %s", provider)
        raise HTTPException(status_code=502, detail=f"Could not start authorization: {exc}") from exc


@router.get("/{provider}/callback")
def oauth_callback(
    provider: str,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    session: Session = Depends(get_session),
) -> RedirectResponse:
    """Redirect-flow return. Browser navigation (no JWT) — trust the signed state."""
    dest_ok = f"{settings.public_base_url}/sync?connected={provider}"
    dest_err = f"{settings.public_base_url}/sync?connect_error={provider}"
    if error or not code or not state:
        return RedirectResponse(dest_err, status_code=302)
    payload = verify_state(state)
    if not payload or payload.get("provider") != provider or "uid" not in payload:
        return RedirectResponse(dest_err, status_code=302)
    connector = get_connector(provider)
    if connector is None:
        return RedirectResponse(dest_err, status_code=302)
    try:
        bundle = connector.exchange_code(code=code, redirect_uri=_redirect_uri(provider))
        svc.upsert_account(session, int(payload["uid"]), provider, bundle)
    except Exception:  # noqa: BLE001
        logger.exception("oauth callback exchange failed for %s", provider)
        return RedirectResponse(dest_err, status_code=302)
    return RedirectResponse(dest_ok, status_code=302)


@router.post("/{provider}/poll")
def poll_device(
    provider: str,
    device_code: str = Body(..., embed=True, max_length=512),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    connector = _require_connector(provider)
    assert current_user.id is not None
    try:
        bundle = connector.poll_device(device_code)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Device authorization failed: {exc}") from exc
    if bundle is None:
        return {"status": "pending"}
    svc.upsert_account(session, current_user.id, provider, bundle)
    return {"status": "connected"}


@router.post("/{provider}/token")
def submit_token(
    provider: str,
    payload: dict = Body(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    connector = _require_connector(provider)
    assert current_user.id is not None
    try:
        bundle = connector.exchange_token_input(payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not link account: {exc}") from exc
    svc.upsert_account(session, current_user.id, provider, bundle)
    return {"status": "connected"}


@router.delete("/{provider}")
def disconnect(
    provider: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    ensure_connectors_loaded()
    assert current_user.id is not None
    removed = svc.delete_account(session, current_user.id, provider)
    return {"disconnected": removed}


# --- Library reads + import -------------------------------------------------

def _load_auth(session: Session, user_id: int, provider: str, connector):
    row = svc.get_account(session, user_id, provider)
    if row is None:
        raise HTTPException(status_code=409, detail=f"{connector.display_name} account is not connected.")
    return svc.account_auth(session, row, connector)


@router.get("/{provider}/playlists")
def list_playlists(
    provider: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    connector = _require_connector(provider)
    assert current_user.id is not None
    auth = _load_auth(session, current_user.id, provider, connector)
    try:
        playlists = connector.list_playlists(auth)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Could not read playlists: {exc}") from exc
    items = [{"id": "liked", "name": "Liked Songs", "count": None, "cover": None, "liked": True}]
    items += [{"id": p.id, "name": p.name, "count": p.count, "cover": p.cover, "liked": False} for p in playlists]
    return {"playlists": items}


class AccountImportRequest(BaseModel):
    playlist_id: str = Field(..., max_length=256)  # "liked" or a playlist id
    add_to_library: bool = True
    create_playlist: bool = True
    playlist_name: Optional[str] = Field(default=None, max_length=200)


@router.post("/{provider}/import")
def import_from_account(
    provider: str,
    body: AccountImportRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    connector = _require_connector(provider)
    assert current_user.id is not None
    auth = _load_auth(session, current_user.id, provider, connector)

    try:
        if body.playlist_id == "liked":
            source = connector.fetch_liked(auth)
            source_title = f"{connector.display_name} Liked Songs"
            source_kind = "liked"
        else:
            source = connector.fetch_playlist(auth, body.playlist_id)
            source_title = None
            source_kind = "playlist"
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Could not read tracks: {exc}") from exc

    try:
        result = resolve_from_source_tracks(
            source_tracks=source,
            source_kind=source_kind,
            source_title=source_title,
            source_platform=provider,
            user_id=current_user.id,
        )
    except ProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    preview = preview_dict_from_result(result)

    added = already = 0
    playlist_id = None
    playlist_name = None
    if body.add_to_library:
        added, already = import_tracks_to_library(session, current_user, result.tracks)
    if body.create_playlist:
        name = (body.playlist_name or source_title or f"Imported from {connector.display_name}").strip()
        pl = create_playlist_from_tracks(session, current_user, name, result.tracks)
        playlist_id = pl.id
        playlist_name = pl.name

    return {
        "source_platform": provider,
        "source_title": source_title,
        "total_tracks": len(result.tracks),
        "source_total": result.source_total,
        "unmatched_count": result.unmatched_count,
        "added_to_library": added,
        "already_in_library": already,
        "playlist_id": playlist_id,
        "playlist_name": playlist_name,
        "preview": preview,
    }
