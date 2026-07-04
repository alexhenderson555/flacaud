"""YouTube Music connected-account connector via ytmusicapi OAuth (device flow).

Uses a Google Cloud OAuth client (TV/limited-input device type). The full OAuth
token JSON is stored (encrypted) as the "refresh" material; ytmusicapi refreshes
the access token itself on each client build.
"""

from __future__ import annotations

import json
from typing import Optional

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.server.settings import settings
from tidal_dl_ru.providers.user_library import (
    AccountAuth,
    ConnectorError,
    ConnectorNotConfigured,
    DeviceAuth,
    OAuthConfig,
    PlaylistRef,
    TokenBundle,
    UserLibraryConnector,
    register_connector,
)


def _credentials():
    cid = settings.google_oauth_client_id
    secret = settings.google_oauth_client_secret
    if not cid or not secret:
        raise ConnectorNotConfigured("Google OAuth credentials (GOOGLE_OAUTH_CLIENT_ID/SECRET) are not set")
    from ytmusicapi.auth.oauth import OAuthCredentials

    return OAuthCredentials(client_id=cid, client_secret=secret)


def _ytm_track(item: dict) -> Optional[Track]:
    vid = item.get("videoId")
    if not vid:
        return None
    artists = [a.get("name") for a in (item.get("artists") or []) if a.get("name")]
    album = (item.get("album") or {}).get("name") if isinstance(item.get("album"), dict) else None
    dur = item.get("duration_seconds")
    return Track(
        provider="ytmusic",
        provider_id=str(vid),
        title=item.get("title") or "",
        artists=artists or ["Unknown"],
        album=album,
        duration_s=int(dur) if dur else None,
    )


class YTMusicConnector(UserLibraryConnector):
    provider = "ytmusic"
    display_name = "YouTube Music"

    def oauth_config(self) -> OAuthConfig:
        configured = bool(settings.google_oauth_client_id and settings.google_oauth_client_secret)
        return OAuthConfig(
            flow="device",
            configured=configured,
            scopes=["https://www.googleapis.com/auth/youtube"],
            note="Open the shown URL and enter the code on any device.",
        )

    def begin_device(self) -> DeviceAuth:
        creds = _credentials()
        code = creds.get_code()
        return DeviceAuth(
            device_code=code["device_code"],
            user_code=code["user_code"],
            verification_url=code.get("verification_url") or code.get("verification_uri") or "https://www.google.com/device",
            interval=int(code.get("interval", 5)),
            expires_in=int(code.get("expires_in", 600)),
        )

    def poll_device(self, device_code: str) -> Optional[TokenBundle]:
        creds = _credentials()
        try:
            token = creds.token_from_code(device_code)
        except Exception:
            # Still pending / slow_down — caller polls again.
            return None
        raw = token if isinstance(token, dict) else getattr(token, "as_dict", lambda: {})()
        if not raw or not raw.get("access_token"):
            return None
        return TokenBundle(
            access_token=raw["access_token"],
            refresh_token=json.dumps(raw),  # full blob; ytmusicapi refreshes from it
            expires_in=raw.get("expires_in"),
            scopes=(raw.get("scope") or "").split() or None,
        )

    def _client(self, auth: AccountAuth):
        if not auth.refresh_token:
            raise ConnectorError("YouTube Music: not authenticated")
        from ytmusicapi import YTMusic

        try:
            return YTMusic(auth=auth.refresh_token, oauth_credentials=_credentials())
        except Exception as exc:  # noqa: BLE001
            raise ConnectorError(f"YouTube Music auth error: {exc}") from exc

    def list_playlists(self, auth: AccountAuth) -> list[PlaylistRef]:
        yt = self._client(auth)
        try:
            rows = yt.get_library_playlists(limit=200)
        except Exception as exc:  # noqa: BLE001
            raise ConnectorError(f"YouTube Music playlists error: {exc}") from exc
        out: list[PlaylistRef] = []
        for r in rows or []:
            pid = r.get("playlistId")
            if not pid:
                continue
            thumbs = r.get("thumbnails") or []
            out.append(
                PlaylistRef(
                    id=str(pid),
                    name=r.get("title") or "Playlist",
                    count=r.get("count"),
                    cover=thumbs[-1].get("url") if thumbs else None,
                )
            )
        return out

    def fetch_liked(self, auth: AccountAuth) -> list[Track]:
        yt = self._client(auth)
        try:
            data = yt.get_liked_songs(limit=5000)
        except Exception as exc:  # noqa: BLE001
            raise ConnectorError(f"YouTube Music liked-songs error: {exc}") from exc
        return [t for t in (_ytm_track(i) for i in (data.get("tracks") or [])) if t]

    def fetch_playlist(self, auth: AccountAuth, playlist_id: str) -> list[Track]:
        yt = self._client(auth)
        try:
            data = yt.get_playlist(playlist_id, limit=5000)
        except Exception as exc:  # noqa: BLE001
            raise ConnectorError(f"YouTube Music playlist error: {exc}") from exc
        return [t for t in (_ytm_track(i) for i in (data.get("tracks") or [])) if t]


register_connector(YTMusicConnector())
