from __future__ import annotations

import base64
import os
import re
from pathlib import Path
from typing import Callable, Optional

import httpx

from tidal_dl_ru.core.models import Quality, Track
from tidal_dl_ru.providers.base import Provider, ProviderError
from tidal_dl_ru.providers.tidal_match import match_tracks_to_tidal


class SpotifyProvider(Provider):
    name = "spotify"
    display_name = "Spotify"

    URL_PATTERN = re.compile(
        r"https?://open\.spotify\.com/(track|playlist|album)/([a-zA-Z0-9]+)",
        re.IGNORECASE,
    )

    def __init__(self):
        self._access_token: str | None = None

    def supports(self, url: str) -> bool:
        return bool(self.URL_PATTERN.match(url))

    def _get_token(self) -> str:
        if self._access_token:
            return self._access_token

        client_id = os.environ.get("SPOTIPY_CLIENT_ID")
        client_secret = os.environ.get("SPOTIPY_CLIENT_SECRET")
        if not client_id or not client_secret:
            raise ProviderError("SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET are not set")

        auth_str = f"{client_id}:{client_secret}"
        b64_auth_str = base64.b64encode(auth_str.encode()).decode()
        headers = {
            "Authorization": f"Basic {b64_auth_str}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        try:
            resp = httpx.post(
                "https://accounts.spotify.com/api/token",
                headers=headers,
                data={"grant_type": "client_credentials"},
                timeout=15.0,
            )
            resp.raise_for_status()
            self._access_token = resp.json()["access_token"]
            return self._access_token
        except Exception as exc:
            raise ProviderError(f"Failed to get Spotify access token: {exc}") from exc

    def _raw_track(self, data: dict) -> Track:
        artists = [a.get("name", "") for a in data.get("artists", []) if a.get("name")]
        return Track(
            provider=self.name,
            provider_id=str(data.get("id", "")),
            title=data.get("name") or "",
            artists=artists or ["Unknown"],
            album=(data.get("album") or {}).get("name"),
            duration_s=int((data.get("duration_ms") or 0) // 1000) or None,
            isrc=((data.get("external_ids") or {}).get("isrc")),
            source_url=(data.get("external_urls") or {}).get("spotify"),
        )

    def _enrich_tracks_isrc(self, tracks: list[Track], headers: dict) -> list[Track]:
        """Album/playlist simplified objects often omit ISRC — batch-fetch full tracks."""
        need = [t for t in tracks if not (t.isrc or "").strip() and t.provider_id and t.provider_id != "html"]
        if not need:
            return tracks
        by_id = {t.provider_id: t for t in tracks}
        for offset in range(0, len(need), 50):
            chunk = need[offset : offset + 50]
            ids = ",".join(t.provider_id for t in chunk)
            try:
                resp = httpx.get(
                    f"https://api.spotify.com/v1/tracks?ids={ids}",
                    headers=headers,
                    timeout=20.0,
                )
                resp.raise_for_status()
            except Exception:
                continue
            for item in resp.json().get("tracks") or []:
                if not item or not item.get("id"):
                    continue
                isrc = (item.get("external_ids") or {}).get("isrc")
                if not isrc:
                    continue
                existing = by_id.get(str(item["id"]))
                if existing:
                    existing.isrc = isrc
                    if not existing.duration_s and item.get("duration_ms"):
                        existing.duration_s = int(item["duration_ms"]) // 1000
        return tracks

    def _fetch_playlist_items(self, playlist_id: str, headers: dict) -> tuple[list[Track], Optional[str]]:
        tracks: list[Track] = []
        title: str | None = None
        offset = 0
        while True:
            try:
                resp = httpx.get(
                    f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks",
                    headers=headers,
                    params={"limit": 100, "offset": offset},
                    timeout=20.0,
                )
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(f"Spotify API error: {exc}") from exc
            payload = resp.json()
            if title is None:
                title = (payload.get("name") if offset == 0 else None) or None
            if offset == 0 and not title:
                try:
                    meta = httpx.get(
                        f"https://api.spotify.com/v1/playlists/{playlist_id}",
                        headers=headers,
                        timeout=15.0,
                    )
                    if meta.status_code == 200:
                        title = meta.json().get("name")
                except httpx.HTTPError:
                    pass

            for item in payload.get("items", []):
                track_data = item.get("track")
                if track_data and track_data.get("id"):
                    tracks.append(self._raw_track(track_data))

            if not payload.get("next"):
                break
            offset += 100
            if offset > 5000:
                break
        return self._enrich_tracks_isrc(tracks, headers), title

    def _fetch_album_tracks(self, album_id: str, headers: dict) -> tuple[list[Track], Optional[str]]:
        tracks: list[Track] = []
        title: str | None = None
        offset = 0
        while True:
            try:
                resp = httpx.get(
                    f"https://api.spotify.com/v1/albums/{album_id}/tracks",
                    headers=headers,
                    params={"limit": 50, "offset": offset},
                    timeout=20.0,
                )
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(f"Spotify API error: {exc}") from exc
            payload = resp.json()
            if title is None:
                try:
                    album_meta = httpx.get(
                        f"https://api.spotify.com/v1/albums/{album_id}",
                        headers=headers,
                        timeout=15.0,
                    )
                    if album_meta.status_code == 200:
                        title = album_meta.json().get("name")
                except httpx.HTTPError:
                    pass
            for track_data in payload.get("items", []):
                if track_data.get("id"):
                    tracks.append(self._raw_track(track_data))
            if not payload.get("next"):
                break
            offset += 50
        return self._enrich_tracks_isrc(tracks, headers), title

    def extract_raw_tracks(self, url: str) -> tuple[list[Track], Optional[str], str, int]:
        """Read Spotify metadata without Tidal matching."""
        m = self.URL_PATTERN.match(url)
        if not m:
            return [], None, "unknown", 0

        kind = m.group(1).lower()
        item_id = m.group(2)

        if kind == "track" and not os.environ.get("SPOTIPY_CLIENT_ID"):
            raw = self._expand_track_html(url)
            title = raw[0].title if raw else None
            return raw, title, "track", 0

        token = self._get_token()
        headers = {"Authorization": f"Bearer {token}"}

        if kind == "track":
            try:
                resp = httpx.get(
                    f"https://api.spotify.com/v1/tracks/{item_id}",
                    headers=headers,
                    timeout=15.0,
                )
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(f"Spotify API error: {exc}") from exc
            raw = [self._raw_track(resp.json())]
            title = raw[0].title
            return raw, title, "track", 0
        if kind == "playlist":
            raw, title = self._fetch_playlist_items(item_id, headers)
            return raw, title, "playlist", 0
        raw, title = self._fetch_album_tracks(item_id, headers)
        return raw, title, "album", 0

    def expand_with_stats(self, url: str) -> tuple[list[Track], Optional[str], str, int, int]:
        raw, title, kind, skipped = self.extract_raw_tracks(url)
        if not raw:
            return [], title, kind, 0, 0

        if kind == "track" and not os.environ.get("SPOTIPY_CLIENT_ID"):
            matched, unmatched, _details = match_tracks_to_tidal(raw)
            if not matched:
                raise ProviderError("Could not match Spotify track on Tidal")
            return matched, title, kind, len(raw), unmatched

        matched, unmatched, _details = match_tracks_to_tidal(raw)
        if not matched:
            raise ProviderError("Could not match any Spotify tracks on Tidal")
        return matched, title, kind, len(raw), unmatched

    def expand(self, url: str) -> list[Track]:
        matched, _title, _kind, _src, _miss = self.expand_with_stats(url)
        return matched

    def _expand_track_html(self, url: str) -> list[Track]:
        try:
            resp = httpx.get(url, timeout=15.0, follow_redirects=True)
            resp.raise_for_status()
        except Exception as exc:
            raise ProviderError(f"Failed to fetch Spotify page: {exc}") from exc

        html = resp.text
        title_match = re.search(r'<meta property="og:title" content="([^"]+)"', html)
        if not title_match:
            raise ProviderError("Could not find track title on Spotify page")
        title = title_match.group(1)

        desc_match = re.search(r'<meta property="og:description" content="([^"]+)"', html)
        if not desc_match:
            raise ProviderError("Could not find track description on Spotify page")
        desc = desc_match.group(1)
        parts = desc.replace("&#183;", "·").split("·")
        artist = parts[0].strip() if parts else ""

        return [
            Track(
                provider=self.name,
                provider_id="html",
                title=title,
                artists=[artist] if artist else ["Unknown"],
                source_url=url,
            )
        ]

    def download(
        self,
        track: Track,
        dest_no_ext: Path,
        quality: Quality,
        on_progress: Optional[Callable[[int, Optional[int]], None]] = None,
    ) -> Path:
        from tidal_dl_ru.core.router import get_provider_by_name

        tidal = get_provider_by_name("tidal")
        if tidal is None:
            raise ProviderError("Tidal provider unavailable for download")
        return tidal.download(track, dest_no_ext, quality, on_progress)
