from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Optional

import yt_dlp

from tidal_dl_ru.core.models import Quality, Track
from tidal_dl_ru.providers.base import ProgressCb, Provider, ProviderError
from tidal_dl_ru.providers.tidal_match import match_tracks_to_tidal

logger = logging.getLogger(__name__)

_SKIP_TITLE_PREFIXES = (
    "[private video]",
    "[deleted video]",
    "[unavailable video]",
    "[video unavailable]",
)

def _info_to_track(info: dict, provider: str) -> Track:
    """Map a yt-dlp info dict to a universal Track."""
    title, artists = _resolve_entry_metadata(info)
    album = info.get("album")
    album_artist = info.get("album_artist")
    track_no = int(info.get("track_number") or 1)
    disc_no = int(info.get("disc_number") or 1)
    duration = info.get("duration")
    year = info.get("release_year")
    release_date = info.get("release_date") or info.get("upload_date")
    if release_date and len(release_date) == 8 and release_date.isdigit():
        release_date = f"{release_date[:4]}-{release_date[4:6]}-{release_date[6:]}"
    cover = info.get("thumbnail")
    isrc = info.get("isrc")
    return Track(
        provider=provider,
        provider_id=str(info.get("id", "")),
        title=title,
        artists=artists,
        album=album,
        album_artist=album_artist,
        track_number=track_no,
        disc_number=disc_no,
        duration_s=int(duration) if duration else None,
        explicit=False,
        year=int(year) if year else None,
        release_date=release_date if isinstance(release_date, str) else None,
        cover_url=cover,
        isrc=isrc if isinstance(isrc, str) else None,
        source_url=info.get("webpage_url") or info.get("original_url"),
    )


def _parse_creator_title(raw_title: str) -> tuple[str, list[str]]:
    """YouTube-style 'Artist - Title' in a single string."""
    title = (raw_title or "").strip()
    for sep in (" - ", " – ", " | ", " — "):
        if sep in title:
            left, right = title.split(sep, 1)
            left, right = left.strip(), right.strip()
            if left and right and len(left) < 80:
                return right, [left]
    return title, []


def _artists_from_entry(entry: dict) -> list[str]:
    artists_field = entry.get("artist") or entry.get("artists") or entry.get("uploader") or entry.get("channel") or ""
    if isinstance(artists_field, str):
        return [a.strip() for a in re.split(r"[,;&]| feat\.? ", artists_field) if a.strip()]
    return [str(a).strip() for a in artists_field if str(a).strip()]


def _is_generic_artist(name: str) -> bool:
    n = _normalize_text(name)
    if n in {"unknown", "various artists", "topic"}:
        return True
    return n.endswith(" topic") or n.endswith("- topic")


def _resolve_entry_metadata(entry: dict) -> tuple[str, list[str]]:
    title = _entry_title(entry)
    artists = _artists_from_entry(entry)
    if title:
        parsed_title, parsed_artists = _parse_creator_title(title)
        if parsed_artists and (
            not artists
            or _is_generic_artist(artists[0])
            or _normalize_text(artists[0]) != _normalize_text(parsed_artists[0])
        ):
            return parsed_title, parsed_artists
    if not artists:
        artists = ["Unknown"]
    return title, artists


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").lower().strip())


def _entry_title(entry: dict) -> str:
    return (entry.get("track") or entry.get("title") or "").strip()


def _is_unavailable_entry(entry: dict | None) -> bool:
    if not entry or not isinstance(entry, dict):
        return True
    if entry.get("is_live"):
        return True
    title = _entry_title(entry).lower()
    if not title:
        return False
    if title in _SKIP_TITLE_PREFIXES:
        return True
    return any(title.startswith(prefix) for prefix in _SKIP_TITLE_PREFIXES)


class YtDlpCatalogProvider(Provider):
    """Expand playlists via yt-dlp, then match tracks to the Tidal catalog."""

    URL_PATTERN: re.Pattern[str]
    format_selector: str = "bestaudio/best"

    def supports(self, url: str) -> bool:
        return bool(self.URL_PATTERN.search(url))

    def _ydl_opts(self, *, quiet: bool = True, flat: bool = False) -> dict:
        return {
            "quiet": quiet,
            "no_warnings": quiet,
            "skip_download": True,
            "extract_flat": flat,
            "ignoreerrors": True,
            "format": self.format_selector,
        }

    def _entry_to_track(self, entry: dict, provider: str) -> Track:
        """Map a full or flat yt-dlp entry to Track (no extra network)."""
        if entry.get("duration") is not None or entry.get("track") or entry.get("album"):
            return _info_to_track(entry, provider)
        title, artists = _resolve_entry_metadata(entry)
        duration = entry.get("duration")
        return Track(
            provider=provider,
            provider_id=str(entry.get("id", "")),
            title=title,
            artists=artists,
            duration_s=int(duration) if duration else None,
            source_url=entry.get("url") or entry.get("webpage_url"),
        )

    def _extract_raw_tracks(self, url: str) -> tuple[list[Track], Optional[str], str, int]:
        try:
            with yt_dlp.YoutubeDL(self._ydl_opts(flat=True)) as ydl:
                info = ydl.extract_info(url, download=False)
        except yt_dlp.DownloadError as exc:
            raise ProviderError(f"{self.display_name}: {exc}") from exc

        if info is None:
            return [], None, "unknown", 0

        title = info.get("playlist_title") or info.get("album") or info.get("title")
        kind = "playlist" if info.get("_type") in ("playlist", "multi_video") else "track"

        if info.get("_type") in ("playlist", "multi_video"):
            entries = [e for e in (info.get("entries") or []) if e and isinstance(e, dict)]
            tracks: list[Track | None] = []
            missing_meta: list[tuple[int, dict]] = []
            skipped = 0

            for idx, entry in enumerate(entries):
                if _is_unavailable_entry(entry):
                    skipped += 1
                    logger.info("%s: skipping unavailable playlist entry %s", self.name, entry.get("id"))
                    continue
                if not _entry_title(entry):
                    missing_meta.append((len(tracks), entry))
                    tracks.append(None)
                else:
                    tracks.append(self._entry_to_track(entry, self.name))

            if missing_meta:
                with yt_dlp.YoutubeDL(self._ydl_opts()) as ydl:
                    for idx, entry in missing_meta:
                        video_url = entry.get("url") or entry.get("webpage_url")
                        if not video_url:
                            skipped += 1
                            continue
                        try:
                            full = ydl.extract_info(video_url, download=False)
                        except yt_dlp.DownloadError as exc:
                            logger.info(
                                "%s: skipping unavailable entry %s: %s",
                                self.name,
                                entry.get("id"),
                                exc,
                            )
                            skipped += 1
                            continue
                        if not full or _is_unavailable_entry(full) or not _entry_title(full):
                            skipped += 1
                            continue
                        tracks[idx] = _info_to_track(full, self.name)

            available = [t for t in tracks if t is not None and (t.title or "").strip()]
            if skipped:
                logger.info("%s: skipped %s unavailable playlist entries", self.name, skipped)
            if not available:
                raise ProviderError(
                    f"{self.display_name}: no available tracks found at URL"
                    + (f" ({skipped} unavailable)" if skipped else "")
                )
            return available, title, "playlist", skipped

        if _is_unavailable_entry(info) or not _entry_title(info):
            raise ProviderError(f"{self.display_name}: track is unavailable")
        return [self._entry_to_track(info, self.name)], title, kind, 0

    def extract_raw_tracks(self, url: str) -> tuple[list[Track], Optional[str], str, int]:
        """Read source metadata without Tidal matching. Returns (tracks, title, kind, skipped_unavailable)."""
        return self._extract_raw_tracks(url)

    def expand(self, url: str) -> list[Track]:
        raw, _title, _kind, _skipped = self._extract_raw_tracks(url)
        if not raw:
            raise ProviderError(f"{self.display_name}: no tracks found at URL")
        matched, unmatched = match_tracks_to_tidal(raw)
        if not matched:
            raise ProviderError(
                f"{self.display_name}: could not match any tracks on Tidal"
                + (f" ({unmatched} unmatched)" if unmatched else "")
            )
        return matched

    def expand_with_stats(self, url: str) -> tuple[list[Track], Optional[str], str, int, int]:
        raw, title, kind, _skipped = self._extract_raw_tracks(url)
        matched, unmatched = match_tracks_to_tidal(raw)
        if not matched:
            raise ProviderError(
                f"{self.display_name}: could not match any tracks on Tidal"
                + (f" ({len(raw)} source tracks)" if raw else "")
            )
        return matched, title, kind, len(raw), unmatched

    def download(
        self,
        track: Track,
        dest_no_ext: Path,
        quality: Quality,
        on_progress: Optional[ProgressCb] = None,
    ) -> Path:
        from tidal_dl_ru.core.router import get_provider_by_name

        tidal = get_provider_by_name("tidal")
        if tidal is None:
            raise ProviderError("Tidal provider unavailable for download")
        return tidal.download(track, dest_no_ext, quality, on_progress)
