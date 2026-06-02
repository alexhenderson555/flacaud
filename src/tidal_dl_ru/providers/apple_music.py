from __future__ import annotations

import re
from pathlib import Path
from typing import Callable, Optional

import httpx

from tidal_dl_ru.core.models import Quality, Track
from tidal_dl_ru.providers.base import Provider, ProviderError


class AppleMusicProvider(Provider):
    name = "apple"
    display_name = "Apple Music (via Tidal matching)"

    URL_PATTERN = re.compile(r"https?://music\.apple\.com/[a-z]{2}/(album|song)/.*/([0-9]+)(\?i=[0-9]+)?", re.IGNORECASE)

    def supports(self, url: str) -> bool:
        return bool(self.URL_PATTERN.search(url))

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
        try:
            resp = httpx.get(url, timeout=10.0, follow_redirects=True)
            resp.raise_for_status()
        except Exception as e:
            raise ProviderError(f"Failed to fetch Apple Music page: {e}")

        html = resp.text

        # og:title typically contains the song/album name and artist
        title_match = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', html)
        if not title_match:
            raise ProviderError("Could not find title on Apple Music page")

        full_title = title_match.group(1).replace("&#39;", "'").replace("&amp;", "&")

        # Usually: "Song Title by Artist" or "Album Name by Artist"
        if " by " in full_title:
            parts = full_title.split(" by ")
            query = f"{parts[1].split(' on Apple')[0].strip()} {parts[0].strip()}"
        else:
            query = full_title

        t = self._match_tidal(query)
        if t:
            return [t]

        raise ProviderError(f"No matches found on Tidal for Apple Music: {query}")

    def download(self, track: Track, dest_no_ext: Path, quality: Quality, on_progress: Optional[Callable[[int, Optional[int]], None]] = None) -> Path:
        from tidal_dl_ru.core.router import get_provider_by_name
        tidal_provider = get_provider_by_name("tidal")
        if tidal_provider:
            return tidal_provider.download(track, dest_no_ext, quality, on_progress)
        raise ProviderError("Tidal provider unavailable for download")
