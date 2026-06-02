from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

import yt_dlp

from tidal_dl_ru.core.models import Quality, Track
from tidal_dl_ru.providers.base import ProgressCb, Provider, ProviderError


def _info_to_track(info: dict, provider: str) -> Track:
    """Map a yt-dlp info dict to a universal Track."""
    title = info.get("track") or info.get("title") or ""
    artists_field = info.get("artists") or info.get("artist") or info.get("uploader") or ""
    if isinstance(artists_field, str):
        artists = [a.strip() for a in re.split(r"[,;&]| feat\.? ", artists_field) if a.strip()]
    else:
        artists = list(artists_field)
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
    return Track(
        provider=provider,
        provider_id=info.get("id", ""),
        title=title,
        artists=artists or [info.get("uploader") or "Unknown"],
        album=album,
        album_artist=album_artist,
        track_number=track_no,
        disc_number=disc_no,
        duration_s=int(duration) if duration else None,
        explicit=False,
        year=int(year) if year else None,
        release_date=release_date if isinstance(release_date, str) else None,
        cover_url=cover,
        source_url=info.get("webpage_url"),
    )


class YtDlpProvider(Provider):
    """Base for any service yt-dlp can extract.

    Subclasses set `name`, `display_name`, and `URL_PATTERN`. Override
    `format_selector` if the default `bestaudio` isn't what you want.
    """

    URL_PATTERN: re.Pattern[str]
    format_selector: str = "bestaudio/best"

    def supports(self, url: str) -> bool:
        return bool(self.URL_PATTERN.search(url))

    def _ydl_opts(self, *, quiet: bool = True) -> dict:
        return {
            "quiet": quiet,
            "no_warnings": quiet,
            "skip_download": True,
            "extract_flat": False,
            "format": self.format_selector,
        }

    def expand(self, url: str) -> list[Track]:
        try:
            with yt_dlp.YoutubeDL(self._ydl_opts()) as ydl:
                info = ydl.extract_info(url, download=False)
        except yt_dlp.DownloadError as exc:
            raise ProviderError(f"{self.display_name}: {exc}") from exc
        if info is None:
            return []
        if info.get("_type") in ("playlist", "multi_video"):
            entries = [e for e in (info.get("entries") or []) if e]
            tracks: list[Track] = []
            for e in entries:
                # Each entry may be a thin reference; resolve if missing core fields.
                if "url" in e and not e.get("title"):
                    with yt_dlp.YoutubeDL(self._ydl_opts()) as ydl:
                        e = ydl.extract_info(e["url"], download=False) or e
                tracks.append(_info_to_track(e, self.name))
            return tracks
        return [_info_to_track(info, self.name)]

    def download(
        self,
        track: Track,
        dest_no_ext: Path,
        quality: Quality,
        on_progress: Optional[ProgressCb] = None,
    ) -> Path:
        if not track.source_url:
            raise ProviderError(f"{self.name}: track has no source_url; cannot download")

        dest_no_ext.parent.mkdir(parents=True, exist_ok=True)

        # yt-dlp picks the extension based on the chosen format. Use a template that
        # writes to a known path; we'll discover the actual extension after download.
        out_template = str(dest_no_ext) + ".%(ext)s"

        downloaded_path: dict[str, Optional[Path]] = {"p": None}

        def progress_hook(d: dict) -> None:
            if d.get("status") == "downloading" and on_progress:
                total = d.get("total_bytes") or d.get("total_bytes_estimate")
                done = d.get("downloaded_bytes") or 0
                on_progress(done, total)
            elif d.get("status") == "finished":
                fn = d.get("filename")
                if fn:
                    downloaded_path["p"] = Path(fn)

        opts = {
            "quiet": True,
            "no_warnings": True,
            "outtmpl": out_template,
            "format": self.format_selector,
            "progress_hooks": [progress_hook],
            "noprogress": True,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([track.source_url])

        path = downloaded_path["p"]
        if path is None or not path.exists():
            # Fallback: glob for the file
            for ext in (".m4a", ".opus", ".mp3", ".webm", ".ogg", ".flac"):
                candidate = dest_no_ext.with_suffix(ext)
                if candidate.exists():
                    path = candidate
                    break
        if path is None or not path.exists():
            raise ProviderError(f"{self.name}: download finished but file not found")
        return path
