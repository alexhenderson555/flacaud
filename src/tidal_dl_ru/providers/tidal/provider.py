from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

import httpx as _httpx

from tidal_dl_ru.core.models import Quality, Track
from tidal_dl_ru.providers.base import ProgressCb, Provider, ProviderError
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.client import TidalClient, cover_url, parse_url
from tidal_dl_ru.providers.tidal.download import download_track
from tidal_dl_ru.providers.tidal.models import (
    AudioQuality,
)
from tidal_dl_ru.providers.tidal.models import (
    Track as TidalTrack,
)

_URL_RE = re.compile(r"tidal\.com(?:/browse)?/(?:track|album|playlist|mix)/[\w-]+", re.I)

_QUALITY_MAP = {
    Quality.LOW: AudioQuality.LOW,
    Quality.HIGH: AudioQuality.HIGH,
    Quality.LOSSLESS: AudioQuality.LOSSLESS,
    Quality.HI_RES: AudioQuality.HI_RES_LOSSLESS,
}


def _to_universal(t: TidalTrack) -> Track:
    artists = [a.name for a in t.artists] if t.artists else (
        [t.artist.name] if t.artist else []
    )
    artist_ids = [str(a.id) for a in t.artists] if t.artists else (
        [str(t.artist.id)] if t.artist else []
    )
    album_artist = None
    album_title = None
    album_id = None
    cover = None
    year = None
    release_date = None
    total_tracks = None
    if t.album:
        album_title = t.album.title
        album_id = str(t.album.id)
        album_artist = t.album.artist.name if t.album.artist else None
        cover = cover_url(t.album.cover) if t.album.cover else None
        release_date = t.album.release_date
        if release_date:
            try:
                year = int(release_date.split("-")[0])
            except ValueError:
                pass
        total_tracks = t.album.number_of_tracks
    return Track(
        provider="tidal",
        provider_id=str(t.id),
        title=t.title,
        artists=artists,
        artist_ids=artist_ids,
        album=album_title,
        album_id=album_id,
        album_artist=album_artist,
        track_number=t.track_number,
        disc_number=t.volume_number,
        total_tracks=total_tracks,
        duration_s=t.duration,
        isrc=t.isrc,
        explicit=t.explicit,
        year=year,
        release_date=release_date,
        cover_url=cover,
        copyright_=t.copyright_,
        source_url=f"https://tidal.com/track/{t.id}",
        version=t.version,
        quality=t.audio_quality,
    )


class TidalProvider(Provider):
    name = "tidal"
    display_name = "Tidal"

    def supports(self, url: str) -> bool:
        return bool(_URL_RE.search(url))

    # ---- account selection -------------------------------------------------

    def _client(self, http=None) -> TidalClient:
        """Get a TidalClient. Uses pool if accounts exist, else falls back to
        the local tokens.json (single-account dev mode).
        """
        try:
            acc, tokens = tidal_pool.acquire(http)
            return TidalClient(
                http=http,
                tokens=tokens,
                on_auth_error=lambda status, _id=acc.id: tidal_pool.report_failure(
                    _id, status
                ),
            )
        except tidal_pool.NoAccountAvailable:
            # Pool is empty — try single-account dev mode.
            return TidalClient(http=http)

    # ---- Provider interface ------------------------------------------------

    def expand(self, url: str) -> list[Track]:
        link = parse_url(url)
        if link is None:
            return []
        try:
            with self._client() as c:
                if link.kind == "track":
                    return [_to_universal(c.get_track(link.id))]
                if link.kind == "album":
                    return [_to_universal(t) for t in c.get_album_tracks(link.id)]
                if link.kind == "playlist":
                    return [_to_universal(t) for t in c.get_playlist_tracks(link.id)]
                return []
        except _httpx.HTTPStatusError as exc:
            raise ProviderError(
                f"Tidal API error {exc.response.status_code} for {link.kind}/{link.id}"
            ) from exc

    def download(
        self,
        track: Track,
        dest_no_ext: Path,
        quality: Quality,
        on_progress: Optional[ProgressCb] = None,
    ) -> Path:
        import httpx

        tidal_q = _QUALITY_MAP[quality]
        http = httpx.Client(timeout=60.0, follow_redirects=True)
        acquired_acc_id: Optional[int] = None
        try:
            try:
                acc, tokens = tidal_pool.acquire(http)
                acquired_acc_id = acc.id
                client = TidalClient(
                    http=http,
                    tokens=tokens,
                    on_auth_error=lambda status, _id=acc.id: tidal_pool.report_failure(
                        _id, status
                    ),
                )
            except tidal_pool.NoAccountAvailable:
                client = TidalClient(http=http)

            manifest = client.get_playback_manifest(track.provider_id, tidal_q)
            path = download_track(http, manifest, dest_no_ext, on_progress=on_progress)
            if acquired_acc_id is not None:
                tidal_pool.report_success(acquired_acc_id)
            return path
        finally:
            http.close()

    def search(self, query: str, limit: int = 10, offset: int = 0) -> list[Track]:
        tracks, _ = self.search_page(query, limit=limit, offset=offset)
        return tracks

    def search_page(self, query: str, limit: int = 10, offset: int = 0) -> tuple[list[Track], bool]:
        with self._client() as c:
            data = c.search(query, limit=limit, offset=offset)
        block = data.get("tracks", {})
        items = block.get("items", [])
        total = block.get("totalNumberOfItems", 0)
        tracks = [_to_universal(TidalTrack.model_validate(it)) for it in items]
        has_more = bool(total and offset + len(items) < total)
        return tracks, has_more
