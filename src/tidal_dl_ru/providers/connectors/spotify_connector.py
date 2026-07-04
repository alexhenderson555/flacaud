"""Spotify connected-account connector: read the user's Liked Songs + playlists.

Authorization Code flow (server-side confidential client, reuses the SPOTIPY_*
app credentials). Track parsing reuses SpotifyProvider so matched output is
identical to the public-URL path.
"""

from __future__ import annotations

import base64
import os
from typing import Optional
from urllib.parse import urlencode

import httpx

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.providers.spotify import SpotifyProvider
from tidal_dl_ru.providers.user_library import (
    AccountAuth,
    ConnectorError,
    ConnectorNotConfigured,
    OAuthConfig,
    PlaylistRef,
    TokenBundle,
    UserLibraryConnector,
    register_connector,
)

_AUTH_URL = "https://accounts.spotify.com/authorize"
_TOKEN_URL = "https://accounts.spotify.com/api/token"
_API = "https://api.spotify.com/v1"
_SCOPES = ["user-library-read", "playlist-read-private"]


def _creds() -> tuple[str, str]:
    cid = os.environ.get("SPOTIPY_CLIENT_ID", "")
    secret = os.environ.get("SPOTIPY_CLIENT_SECRET", "")
    if not cid or not secret:
        raise ConnectorNotConfigured("Spotify app credentials (SPOTIPY_CLIENT_ID/SECRET) are not set")
    return cid, secret


def _basic_auth_header() -> dict:
    cid, secret = _creds()
    token = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    return {"Authorization": f"Basic {token}", "Content-Type": "application/x-www-form-urlencoded"}


class SpotifyConnector(UserLibraryConnector):
    provider = "spotify"
    display_name = "Spotify"

    def __init__(self) -> None:
        self._sp = SpotifyProvider()  # reuse _raw_track / _enrich_tracks_isrc / _fetch_playlist_items

    def oauth_config(self) -> OAuthConfig:
        configured = bool(os.environ.get("SPOTIPY_CLIENT_ID") and os.environ.get("SPOTIPY_CLIENT_SECRET"))
        return OAuthConfig(flow="redirect", configured=configured, scopes=_SCOPES)

    def build_authorize_url(self, *, state: str, redirect_uri: str) -> str:
        cid, _ = _creds()
        params = {
            "client_id": cid,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "scope": " ".join(_SCOPES),
            "state": state,
        }
        return f"{_AUTH_URL}?{urlencode(params)}"

    def exchange_code(self, *, code: str, redirect_uri: str, code_verifier: Optional[str] = None) -> TokenBundle:
        try:
            resp = httpx.post(
                _TOKEN_URL,
                headers=_basic_auth_header(),
                data={"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri},
                timeout=15.0,
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise ConnectorError(f"Spotify token exchange failed: {exc}") from exc
        data = resp.json()
        account_id, display_name = self._me(data.get("access_token", ""))
        return TokenBundle(
            access_token=data["access_token"],
            refresh_token=data.get("refresh_token"),
            expires_in=data.get("expires_in"),
            scopes=(data.get("scope") or "").split() or _SCOPES,
            account_id=account_id,
            display_name=display_name,
        )

    def refresh(self, auth: AccountAuth) -> Optional[TokenBundle]:
        if not auth.refresh_token:
            return None
        try:
            resp = httpx.post(
                _TOKEN_URL,
                headers=_basic_auth_header(),
                data={"grant_type": "refresh_token", "refresh_token": auth.refresh_token},
                timeout=15.0,
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise ConnectorError(f"Spotify token refresh failed: {exc}") from exc
        data = resp.json()
        return TokenBundle(
            access_token=data["access_token"],
            # Spotify may omit a new refresh token; keep the existing one.
            refresh_token=data.get("refresh_token") or auth.refresh_token,
            expires_in=data.get("expires_in"),
            scopes=(data.get("scope") or "").split() or None,
        )

    def _me(self, access_token: str) -> tuple[Optional[str], Optional[str]]:
        try:
            resp = httpx.get(f"{_API}/me", headers=self._bearer(access_token), timeout=15.0)
            resp.raise_for_status()
            data = resp.json()
            return data.get("id"), (data.get("display_name") or data.get("id"))
        except httpx.HTTPError:
            return None, None

    @staticmethod
    def _bearer(access_token: str) -> dict:
        return {"Authorization": f"Bearer {access_token}"}

    def list_playlists(self, auth: AccountAuth) -> list[PlaylistRef]:
        if not auth.access_token:
            raise ConnectorError("Spotify: not authenticated")
        headers = self._bearer(auth.access_token)
        out: list[PlaylistRef] = []
        offset = 0
        while True:
            try:
                resp = httpx.get(
                    f"{_API}/me/playlists",
                    headers=headers,
                    params={"limit": 50, "offset": offset},
                    timeout=20.0,
                )
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise ConnectorError(f"Spotify playlists error: {exc}") from exc
            payload = resp.json()
            for item in payload.get("items", []):
                if not item or not item.get("id"):
                    continue
                images = item.get("images") or []
                out.append(
                    PlaylistRef(
                        id=str(item["id"]),
                        name=item.get("name") or "Playlist",
                        count=(item.get("tracks") or {}).get("total"),
                        cover=images[0].get("url") if images else None,
                    )
                )
            if not payload.get("next"):
                break
            offset += 50
            if offset > 2000:
                break
        return out

    def fetch_liked(self, auth: AccountAuth) -> list[Track]:
        if not auth.access_token:
            raise ConnectorError("Spotify: not authenticated")
        headers = self._bearer(auth.access_token)
        tracks: list[Track] = []
        offset = 0
        while True:
            try:
                resp = httpx.get(
                    f"{_API}/me/tracks",
                    headers=headers,
                    params={"limit": 50, "offset": offset},
                    timeout=20.0,
                )
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise ConnectorError(f"Spotify liked-songs error: {exc}") from exc
            payload = resp.json()
            for item in payload.get("items", []):
                td = item.get("track")
                if td and td.get("id"):
                    tracks.append(self._sp._raw_track(td))
            if not payload.get("next"):
                break
            offset += 50
            if offset > 10000:
                break
        return self._sp._enrich_tracks_isrc(tracks, headers)

    def fetch_playlist(self, auth: AccountAuth, playlist_id: str) -> list[Track]:
        if not auth.access_token:
            raise ConnectorError("Spotify: not authenticated")
        headers = self._bearer(auth.access_token)
        tracks, _title = self._sp._fetch_playlist_items(playlist_id, headers)
        return tracks


register_connector(SpotifyConnector())
