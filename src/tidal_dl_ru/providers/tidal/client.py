from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Optional

import httpx

from tidal_dl_ru.config import API_BASE, DEFAULT_COUNTRY
from tidal_dl_ru.providers.tidal.auth import get_valid_tokens
from tidal_dl_ru.providers.tidal.auth import refresh_token as _refresh
from tidal_dl_ru.providers.tidal.models import (
    Album,
    Artist,
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

    def search(self, query: str, limit: int = 10, offset: int = 0) -> dict:
        return self._get(
            "/search",
            query=query,
            limit=limit,
            offset=offset,
            types="TRACKS",
        )

    def search_artists(self, query: str, limit: int = 10, offset: int = 0) -> list[Artist]:
        data = self._get(
            "/search",
            query=query,
            limit=limit,
            offset=offset,
            types="ARTISTS",
        )
        block = data.get("artists", {})
        items = block.get("items", [])
        return [Artist.model_validate(it) for it in items]

    def get_track(self, track_id: str | int) -> Track:
        data = self._get(f"/tracks/{track_id}")
        return Track.model_validate(data)

    def get_album(self, album_id: str | int) -> Album:
        data = self._get(f"/albums/{album_id}")
        return Album.model_validate(data)

    def get_album_tracks(self, album_id: str | int) -> list[Track]:
        data = self._get(f"/albums/{album_id}/tracks", limit=999)
        return [Track.model_validate(item) for item in data.get("items", [])]

    def get_playlist(self, playlist_uuid: str):
        from tidal_dl_ru.providers.tidal.models import Playlist

        data = self._get(f"/playlists/{playlist_uuid}")
        return Playlist.model_validate(data)

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
        data = self._get(f"/artists/{artist_id}")
        return Artist.model_validate(data)

    def get_artist_albums(self, artist_id: str | int) -> list[Album]:
        data = self._get(f"/artists/{artist_id}/albums", limit=100)
        return [Album.model_validate(item) for item in data.get("items", [])]

    def get_artist_top_tracks(self, artist_id: str | int) -> list[Track]:
        data = self._get(f"/artists/{artist_id}/toptracks", limit=20)
        return [Track.model_validate(item) for item in data.get("items", [])]

    def get_similar_artists(self, artist_id: str | int, limit: int = 20) -> list[Artist]:
        """Artists in a similar style (not the same artist's top tracks)."""
        data = self._get(f"/artists/{artist_id}/similar", limit=limit)
        return [Artist.model_validate(item) for item in data.get("items", [])]

    def _items_to_tracks(self, data: dict) -> list[Track]:
        items = data.get("items") or data.get("tracks") or []
        out: list[Track] = []
        for entry in items:
            raw = entry.get("item") if isinstance(entry, dict) and "item" in entry else entry
            if not isinstance(raw, dict):
                continue
            try:
                out.append(Track.model_validate(raw))
            except Exception:
                continue
        return out

    def get_track_radio(self, track_id: str | int, limit: int = 30) -> list[Track]:
        """Tidal track radio — style-matched succession."""
        data = self._get(f"/tracks/{track_id}/radio", limit=limit)
        return self._items_to_tracks(data)

    def get_artist_radio(self, artist_id: str | int, limit: int = 30) -> list[Track]:
        """Tidal artist radio station (style blend, not top-hits list)."""
        try:
            data = self._get(f"/artists/{artist_id}/radio", limit=limit)
            return self._items_to_tracks(data)
        except httpx.HTTPStatusError:
            return []

    def get_similar_tracks(self, track_id: str | int, limit: int = 30) -> list[Track]:
        for path in (f"/tracks/{track_id}/similarTracks", f"/tracks/{track_id}/similar"):
            try:
                data = self._get(path, limit=limit)
                parsed = self._items_to_tracks(data)
                if parsed:
                    return parsed
            except httpx.HTTPStatusError:
                continue
        return []

    def get_track_mix_tracks(self, track_id: str | int, limit: int = 30) -> list[Track]:
        """Editorial TRACK_MIX playlist for a seed track."""
        meta = self._get(f"/tracks/{track_id}")
        mixes = meta.get("mixes") or {}
        mix_id = mixes.get("TRACK_MIX") or mixes.get("trackMix")
        if not mix_id:
            return []
        for path in (f"/mixes/{mix_id}/items", f"/mixes/{mix_id}/tracks"):
            try:
                data = self._get(path, limit=limit)
                parsed = self._items_to_tracks(data)
                if parsed:
                    return parsed
            except httpx.HTTPStatusError:
                continue
        return []

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
        return None

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
