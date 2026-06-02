from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Optional

import httpx

from tidal_dl_ru.config import API_BASE, DEFAULT_COUNTRY
from tidal_dl_ru.providers.tidal.auth import get_valid_tokens, refresh_token as _refresh
from tidal_dl_ru.providers.tidal.models import (
    Album,
    AudioQuality,
    PlaybackManifest,
    TokenSet,
    Track,
)


URL_RE = re.compile(
    r"tidal\.com(?:/browse)?/(?P<kind>track|album|playlist|mix)/(?P<id>[\w-]+)",
    re.IGNORECASE,
)


@dataclass
class TidalLink:
    kind: str  # "track" | "album" | "playlist" | "mix"
    id: str


def parse_url(url_or_id: str) -> Optional[TidalLink]:
    m = URL_RE.search(url_or_id)
    if not m:
        return None
    return TidalLink(kind=m.group("kind").lower(), id=m.group("id"))


def cover_url(cover_uuid: str, size: int = 640) -> str:
    path = cover_uuid.replace("-", "/")
    return f"https://resources.tidal.com/images/{path}/{size}x{size}.jpg"


class TidalClient:
    """Synchronous Tidal API client.

    Two construction modes:
    - Default: read tokens from local tokens.json (single-account dev mode).
    - With `tokens=`: caller supplies a TokenSet (used by the pool: each request
      picks an account and instantiates a client around it).

    When `on_auth_error` is set, the callback is invoked with the HTTP status
    code on 401/403 from any API call. Pool uses this to mark accounts banned.
    """

    def __init__(
        self,
        http: Optional[httpx.Client] = None,
        *,
        tokens: Optional[TokenSet] = None,
        on_auth_error: Optional[Callable[[int], None]] = None,
    ) -> None:
        self._http = http or httpx.Client(timeout=30.0)
        if tokens is None:
            tokens = get_valid_tokens(self._http)
        self._tokens = tokens
        self._access = tokens.access_token
        self._country = tokens.country_code or DEFAULT_COUNTRY
        self._on_auth_error = on_auth_error
        self._http.headers["Authorization"] = f"Bearer {self._access}"

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "TidalClient":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def _get(self, path: str, **params) -> dict:
        params.setdefault("countryCode", self._country)
        resp = self._http.get(f"{API_BASE}{path}", params=params)
        if resp.status_code == 401:
            # Access token may have died — try one refresh using our refresh_token.
            try:
                self._tokens = _refresh(self._http, self._tokens.refresh_token)
            except Exception:
                if self._on_auth_error:
                    self._on_auth_error(401)
                resp.raise_for_status()
            self._access = self._tokens.access_token
            self._http.headers["Authorization"] = f"Bearer {self._access}"
            resp = self._http.get(f"{API_BASE}{path}", params=params)
        if resp.status_code in (401, 403, 429) and self._on_auth_error:
            self._on_auth_error(resp.status_code)
        resp.raise_for_status()
        return resp.json()

    @property
    def tokens(self) -> TokenSet:
        """Current (possibly refreshed) token set."""
        return self._tokens

    # ---- metadata ----

    def search(self, query: str, limit: int = 10) -> dict:
        return self._get(
            "/search",
            query=query,
            limit=limit,
            types="ARTISTS,ALBUMS,TRACKS,PLAYLISTS",
        )

    def get_track(self, track_id: str | int) -> Track:
        data = self._get(f"/tracks/{track_id}")
        return Track.model_validate(data)

    def get_album(self, album_id: str | int) -> Album:
        data = self._get(f"/albums/{album_id}")
        return Album.model_validate(data)

    def get_album_tracks(self, album_id: str | int) -> list[Track]:
        data = self._get(f"/albums/{album_id}/tracks", limit=999)
        return [Track.model_validate(item) for item in data.get("items", [])]

    def get_playlist_tracks(self, playlist_uuid: str) -> list[Track]:
        items: list[Track] = []
        offset = 0
        while True:
            data = self._get(
                f"/playlists/{playlist_uuid}/tracks", limit=100, offset=offset
            )
            chunk = data.get("items", [])
            if not chunk:
                break
            items.extend(Track.model_validate(it) for it in chunk)
            if len(chunk) < 100:
                break
            offset += len(chunk)
        return items

    def get_artist(self, artist_id: str | int) -> Artist:
        from tidal_dl_ru.providers.tidal.models import Artist
        data = self._get(f"/artists/{artist_id}")
        return Artist.model_validate(data)

    def get_artist_albums(self, artist_id: str | int) -> list[Album]:
        data = self._get(f"/artists/{artist_id}/albums", limit=100)
        return [Album.model_validate(item) for item in data.get("items", [])]

    def get_artist_top_tracks(self, artist_id: str | int) -> list[Track]:
        data = self._get(f"/artists/{artist_id}/toptracks", limit=20)
        return [Track.model_validate(item) for item in data.get("items", [])]

    def search_by_isrc(self, isrc: str) -> Optional[Track]:
        """Find a track by ISRC. Returns None if not found."""
        data = self._get("/search", query=isrc, limit=1, types="TRACKS")
        items = data.get("tracks", {}).get("items", [])
        if not items:
            return None
        # Verify ISRC matches.
        track = Track.model_validate(items[0])
        if track.isrc and track.isrc.upper() == isrc.upper():
            return track
        return track  # Best match even if ISRC doesn't match exactly.

    # ---- streams ----

    def get_playback_manifest(
        self, track_id: str | int, quality: AudioQuality
    ) -> PlaybackManifest:
        data = self._get(
            f"/tracks/{track_id}/playbackinfopostpaywall",
            audioquality=quality.value,
            playbackmode="STREAM",
            assetpresentation="FULL",
        )
        return PlaybackManifest.model_validate(data)
