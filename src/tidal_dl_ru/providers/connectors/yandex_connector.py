"""Yandex Music connected-account connector (UNOFFICIAL).

Uses the community `yandex-music` library with a user-supplied OAuth token
(obtained via yandex-music-token / the app). No server-side app credentials —
this is a reverse-engineered API and may break without notice (ToS risk).
"""

from __future__ import annotations

from typing import Optional

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.providers.user_library import (
    AccountAuth,
    ConnectorError,
    OAuthConfig,
    PlaylistRef,
    TokenBundle,
    UserLibraryConnector,
    register_connector,
)


def _ya_track(t) -> Optional[Track]:
    if t is None:
        return None
    tid = getattr(t, "id", None)
    if not tid:
        return None
    artists = [a.name for a in (getattr(t, "artists", None) or []) if getattr(a, "name", None)]
    albums = getattr(t, "albums", None) or []
    album = getattr(albums[0], "title", None) if albums else None
    dur_ms = getattr(t, "duration_ms", None) or 0
    return Track(
        provider="yandex",
        provider_id=str(tid),
        title=getattr(t, "title", None) or "",
        artists=artists or ["Unknown"],
        album=album,
        duration_s=int(dur_ms) // 1000 or None,
    )


class YandexConnector(UserLibraryConnector):
    provider = "yandex"
    display_name = "Yandex Music"

    def oauth_config(self) -> OAuthConfig:
        # Always available (no server app creds), but unofficial/fragile.
        return OAuthConfig(
            flow="token",
            configured=True,
            unofficial=True,
            note="Paste your Yandex Music OAuth token (get it via a yandex-music-token helper).",
        )

    def _make_client(self, token: str):
        from yandex_music import Client

        try:
            return Client(token).init()
        except Exception as exc:  # noqa: BLE001
            raise ConnectorError(f"Yandex Music auth failed: {exc}") from exc

    def exchange_token_input(self, payload: dict) -> TokenBundle:
        token = str(payload.get("token") or "").strip()
        if not token:
            raise ConnectorError("A Yandex Music token is required.")
        client = self._make_client(token)
        account = None
        display = None
        try:
            me = getattr(client, "me", None)
            acc = getattr(me, "account", None) if me else None
            account = str(getattr(acc, "uid", "")) or None
            display = getattr(acc, "display_name", None) or getattr(acc, "login", None)
        except Exception:  # noqa: BLE001
            pass
        return TokenBundle(access_token=token, refresh_token=token, account_id=account, display_name=display)

    def _client(self, auth: AccountAuth):
        token = auth.refresh_token or auth.access_token
        if not token:
            raise ConnectorError("Yandex Music: not authenticated")
        return self._make_client(token)

    def list_playlists(self, auth: AccountAuth) -> list[PlaylistRef]:
        client = self._client(auth)
        try:
            playlists = client.users_playlists_list()
        except Exception as exc:  # noqa: BLE001
            raise ConnectorError(f"Yandex Music playlists error: {exc}") from exc
        out: list[PlaylistRef] = []
        for p in playlists or []:
            kind = getattr(p, "kind", None)
            if kind is None:
                continue
            out.append(PlaylistRef(
                id=str(kind),
                name=getattr(p, "title", None) or "Playlist",
                count=getattr(p, "track_count", None),
            ))
        return out

    def fetch_liked(self, auth: AccountAuth) -> list[Track]:
        client = self._client(auth)
        try:
            likes = client.users_likes_tracks()
            tracks = likes.fetch_tracks() if likes else []
        except Exception as exc:  # noqa: BLE001
            raise ConnectorError(f"Yandex Music liked-songs error: {exc}") from exc
        return [t for t in (_ya_track(x) for x in (tracks or [])) if t]

    def fetch_playlist(self, auth: AccountAuth, playlist_id: str) -> list[Track]:
        client = self._client(auth)
        try:
            pl = client.users_playlists(int(playlist_id))
            rows = getattr(pl, "tracks", None) or []
            tracks = [getattr(r, "track", None) or r.fetch_track() for r in rows]
        except Exception as exc:  # noqa: BLE001
            raise ConnectorError(f"Yandex Music playlist error: {exc}") from exc
        return [t for t in (_ya_track(x) for x in tracks) if t]


register_connector(YandexConnector())
