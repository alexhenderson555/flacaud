from __future__ import annotations

import base64
import os
import re
from pathlib import Path
from typing import Callable, Optional

import httpx

from tidal_dl_ru.core.models import Quality, Track
from tidal_dl_ru.providers.base import Provider, ProviderError

# Circular import removed

class SpotifyProvider(Provider):
    name = "spotify"
    display_name = "Spotify (via Tidal matching)"

    URL_PATTERN = re.compile(r"https?://open\.spotify\.com/(track|playlist|album)/([a-zA-Z0-9]+)", re.IGNORECASE)

    def __init__(self):
        super().__init__()
        self._access_token = None

    def supports(self, url: str) -> bool:
        return bool(self.URL_PATTERN.match(url))

    def _get_token(self) -> str:
        if self._access_token:
            return self._access_token

        client_id = os.environ.get("SPOTIPY_CLIENT_ID")
        client_secret = os.environ.get("SPOTIPY_CLIENT_SECRET")
        if not client_id or not client_secret:
            raise ProviderError("SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET are not set in .env")

        auth_str = f"{client_id}:{client_secret}"
        b64_auth_str = base64.b64encode(auth_str.encode()).decode()

        headers = {
            "Authorization": f"Basic {b64_auth_str}",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        data = {"grant_type": "client_credentials"}

        try:
            resp = httpx.post("https://accounts.spotify.com/api/token", headers=headers, data=data, timeout=10.0)
            resp.raise_for_status()
            self._access_token = resp.json()["access_token"]
            return self._access_token
        except Exception as e:
            raise ProviderError(f"Failed to get Spotify access token: {e}")

    def _match_tidal(self, query: str) -> Optional[Track]:
        from tidal_dl_ru.core.router import get_provider_by_name
        tidal_provider = get_provider_by_name("tidal")
        if not tidal_provider:
            return None
        try:
            tracks = tidal_provider.search(query, limit=1)
            return tracks[0] if tracks else None
        except Exception:
            return None

    def expand(self, url: str) -> list[Track]:
        m = self.URL_PATTERN.match(url)
        if not m:
            return []

        type_ = m.group(1).lower()
        id_ = m.group(2)

        if type_ == "track" and not os.environ.get("SPOTIPY_CLIENT_ID"):
            return self._expand_track_html(url)

        token = self._get_token()
        headers = {"Authorization": f"Bearer {token}"}

        matched_tracks = []

        if type_ == "track":
            try:
                resp = httpx.get(f"https://api.spotify.com/v1/tracks/{id_}", headers=headers, timeout=10.0)
                resp.raise_for_status()
                data = resp.json()
                artist = data["artists"][0]["name"]
                title = data["name"]
                t = self._match_tidal(f"{artist} {title}")
                if t: matched_tracks.append(t)
            except Exception as e:
                raise ProviderError(f"Failed to fetch Spotify track: {e}")

        elif type_ == "playlist":
            try:
                resp = httpx.get(f"https://api.spotify.com/v1/playlists/{id_}/tracks?limit=100", headers=headers, timeout=10.0)
                resp.raise_for_status()
                items = resp.json().get("items", [])
                for item in items:
                    track_data = item.get("track")
                    if not track_data: continue
                    artist = track_data["artists"][0]["name"]
                    title = track_data["name"]
                    t = self._match_tidal(f"{artist} {title}")
                    if t: matched_tracks.append(t)
            except Exception as e:
                raise ProviderError(f"Failed to fetch Spotify playlist: {e}")

        elif type_ == "album":
            try:
                resp = httpx.get(f"https://api.spotify.com/v1/albums/{id_}/tracks?limit=50", headers=headers, timeout=10.0)
                resp.raise_for_status()
                items = resp.json().get("items", [])
                for track_data in items:
                    artist = track_data["artists"][0]["name"]
                    title = track_data["name"]
                    t = self._match_tidal(f"{artist} {title}")
                    if t: matched_tracks.append(t)
            except Exception as e:
                raise ProviderError(f"Failed to fetch Spotify album: {e}")

        if not matched_tracks:
            raise ProviderError("Could not match any Spotify tracks on Tidal.")

        return matched_tracks

    def _expand_track_html(self, url: str) -> list[Track]:
        try:
            resp = httpx.get(url, timeout=10.0, follow_redirects=True)
            resp.raise_for_status()
        except Exception as e:
            raise ProviderError(f"Failed to fetch Spotify page: {e}")

        html = resp.text
        title_match = re.search(r'<meta property="og:title" content="([^"]+)"', html)
        if not title_match:
            raise ProviderError("Could not find track title on Spotify page")
        title = title_match.group(1)

        desc_match = re.search(r'<meta property="og:description" content="([^"]+)"', html)
        if not desc_match:
            raise ProviderError("Could not find track description on Spotify page")
        desc = desc_match.group(1)

        parts = desc.replace("&#183;", "\xb7").replace("·", "\xb7").split("\xb7")
        artist = parts[0].strip() if parts else ""

        t = self._match_tidal(f"{artist} {title}")
        if t:
            return [t]
        raise ProviderError(f"No matches found on Tidal for: {artist} {title}")

    def download(
        self,
        track: Track,
        dest_no_ext: Path,
        quality: Quality,
        on_progress: Optional[Callable[[int, Optional[int]], None]] = None,
    ) -> Path:
        from tidal_dl_ru.core.router import get_provider_by_name
        tidal_provider = get_provider_by_name("tidal")
        if tidal_provider:
            return tidal_provider.download(track, dest_no_ext, quality, on_progress)
        raise ProviderError("Tidal provider unavailable for download")
