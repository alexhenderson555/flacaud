"""VK Music connected-account connector (UNOFFICIAL).

VK's audio API is closed to third-party apps; playback of a user's audios needs a
special "Kate Mobile"-style token (obtained via the vkaudiotoken helper) plus the
matching user-agent. The user pastes that token here. Reverse-engineered and
against VK ToS — may break at any time.
"""

from __future__ import annotations

import httpx

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

_API = "https://api.vk.com/method"
_API_VERSION = "5.131"
_FALLBACK_UA = "KateMobileAndroid/56 lite-460 (Android 4.4.2; SDK 19; x86; unknown Android SDK built for x86; en)"


def _kate_ua() -> str:
    try:
        from vkaudiotoken import supported_clients

        return supported_clients.KATE.user_agent
    except Exception:  # noqa: BLE001
        return _FALLBACK_UA


def _vk_call(token: str, method: str, params: dict) -> dict:
    query = {**params, "access_token": token, "v": _API_VERSION}
    try:
        resp = httpx.get(f"{_API}/{method}", params=query, headers={"User-Agent": _kate_ua()}, timeout=20.0)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as exc:
        raise ConnectorError(f"VK API error ({method}): {exc}") from exc
    if "error" in data:
        msg = (data.get("error") or {}).get("error_msg", "unknown error")
        raise ConnectorError(f"VK API error ({method}): {msg}")
    return data.get("response") or {}


def _vk_track(item: dict) -> Track | None:
    aid = item.get("id")
    owner = item.get("owner_id")
    if aid is None or owner is None:
        return None
    dur = item.get("duration")
    return Track(
        provider="vk",
        provider_id=f"{owner}_{aid}",
        title=item.get("title") or "",
        artists=[item.get("artist")] if item.get("artist") else ["Unknown"],
        duration_s=int(dur) if dur else None,
    )


class VkConnector(UserLibraryConnector):
    provider = "vk"
    display_name = "VK Music"

    def oauth_config(self) -> OAuthConfig:
        return OAuthConfig(
            flow="token",
            configured=True,
            unofficial=True,
            note="Paste a VK audio token (Kate Mobile method). VK's audio API is unofficial.",
        )

    def exchange_token_input(self, payload: dict) -> TokenBundle:
        token = str(payload.get("token") or "").strip()
        if not token:
            raise ConnectorError("A VK audio token is required.")
        # Validate by a cheap call.
        _vk_call(token, "audio.get", {"count": 1})
        return TokenBundle(access_token=token, refresh_token=token)

    @staticmethod
    def _token(auth: AccountAuth) -> str:
        token = auth.refresh_token or auth.access_token
        if not token:
            raise ConnectorError("VK Music: not authenticated")
        return token

    def list_playlists(self, auth: AccountAuth) -> list[PlaylistRef]:
        resp = _vk_call(self._token(auth), "audio.getPlaylists", {"count": 100})
        out: list[PlaylistRef] = []
        for p in resp.get("items", []) or []:
            pid = p.get("id")
            owner = p.get("owner_id")
            if pid is None or owner is None:
                continue
            out.append(PlaylistRef(
                id=f"{owner}_{pid}",
                name=p.get("title") or "Playlist",
                count=p.get("count"),
            ))
        return out

    def fetch_liked(self, auth: AccountAuth) -> list[Track]:
        resp = _vk_call(self._token(auth), "audio.get", {"count": 6000})
        return [t for t in (_vk_track(i) for i in (resp.get("items") or [])) if t]

    def fetch_playlist(self, auth: AccountAuth, playlist_id: str) -> list[Track]:
        try:
            owner, album = playlist_id.split("_", 1)
        except ValueError as exc:
            raise ConnectorError("Invalid VK playlist id") from exc
        resp = _vk_call(self._token(auth), "audio.get", {"owner_id": owner, "album_id": album, "count": 6000})
        return [t for t in (_vk_track(i) for i in (resp.get("items") or [])) if t]


register_connector(VkConnector())
