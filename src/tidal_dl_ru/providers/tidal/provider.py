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
from tidal_dl_ru.providers.tidal.quality_probe import (
    manifest_delivers_ui_tier,
    pick_download_ui_quality,
    probe_tidal_qualities,
    ui_quality_to_enum,
)

_URL_RE = re.compile(r"tidal\.com(?:/browse)?/(?:track|album|playlist|mix)/[\w-]+", re.I)

_QUALITY_MAP = {
    Quality.LOW: AudioQuality.LOW,
    Quality.HIGH: AudioQuality.HIGH,
    Quality.LOSSLESS: AudioQuality.LOSSLESS,
    Quality.HI_RES: AudioQuality.HI_RES_LOSSLESS,
}


def _parse_release_meta(raw: str | None) -> tuple[str | None, int | None]:
    """ISO date or Tidal streamStartDate → (YYYY-MM-DD, year)."""
    if not raw:
        return None, None
    part = raw.split("T")[0].strip()
    if len(part) < 4 or not part[:4].isdigit():
        return None, None
    try:
        year = int(part[:4])
    except ValueError:
        return None, None
    release = part if len(part) >= 10 else f"{year}-01-01"
    return release, year


def _release_meta_from_tidal(t: TidalTrack) -> tuple[str | None, int | None]:
    if t.album and t.album.release_date:
        return _parse_release_meta(t.album.release_date)
    if t.stream_start_date:
        return _parse_release_meta(t.stream_start_date)
    return None, None


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
    release_date, year = _release_meta_from_tidal(t)
    total_tracks = None
    if t.album:
        album_title = t.album.title
        album_id = str(t.album.id)
        album_artist = t.album.artist.name if t.album.artist else None
        cover = cover_url(t.album.cover) if t.album.cover else None
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


def to_universal_enriched(client: TidalClient | None, t: TidalTrack) -> Track:
    """Map Tidal track; fetch full album when stub has no release date."""
    uni = _to_universal(t)
    if uni.release_date or uni.year or not client or not uni.album_id:
        return uni
    try:
        alb = client.get_album(uni.album_id)
        release_date, year = _parse_release_meta(alb.release_date)
        if release_date:
            return uni.model_copy(update={"release_date": release_date, "year": year})
    except Exception:
        pass
    return uni


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
                on_auth_error=(lambda _id=acc.id: lambda status: tidal_pool.report_failure(
                    _id, status
                ))(),
                on_token_refresh=(lambda _id=acc.id: lambda toks: tidal_pool.update_refresh_token(
                    _id, toks.refresh_token
                ))(),
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

        http = httpx.Client(timeout=60.0, follow_redirects=True)
        acquired_acc_id: Optional[int] = None
        try:
            try:
                acc, tokens = tidal_pool.acquire(http)
                acquired_acc_id = acc.id
                client = TidalClient(
                    http=http,
                    tokens=tokens,
                    on_auth_error=(lambda _id=acc.id: lambda status: tidal_pool.report_failure(
                        _id, status
                    ))(),
                    on_token_refresh=(lambda _id=acc.id: lambda toks: tidal_pool.update_refresh_token(
                        _id, toks.refresh_token
                    ))(),
                )
            except tidal_pool.NoAccountAvailable:
                client = TidalClient(http=http)

            probe = probe_tidal_qualities(client, track.provider_id)
            probe_dl = probe.get("downloadable") or []
            ui_pick = pick_download_ui_quality(quality.value, probe)
            candidates: list[str] = [ui_pick]
            for tier in ("HI_RES", "LOSSLESS", "HIGH"):
                if tier in probe_dl and tier not in candidates:
                    candidates.append(tier)
            if "HIGH" not in candidates:
                candidates.append("HIGH")
            manifest = None
            ui_pick = "HIGH"
            for candidate in candidates:
                tidal_q = ui_quality_to_enum(candidate)
                m = client.get_playback_manifest(track.provider_id, tidal_q)
                if manifest_delivers_ui_tier(m, candidate):
                    manifest = m
                    ui_pick = candidate
                    break
            if manifest is None:
                manifest = client.get_playback_manifest(
                    track.provider_id, ui_quality_to_enum("HIGH")
                )
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
