from __future__ import annotations

import logging
import re
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.providers.base import ProviderError
from tidal_dl_ru.providers.ytdlp_base import YtDlpCatalogProvider, _parse_creator_title

logger = logging.getLogger(__name__)


def _pick_thumb_url(value: Any) -> Optional[str]:
    if isinstance(value, list):
        for item in reversed(value):
            if isinstance(item, dict) and item.get("url"):
                return str(item["url"])
    if isinstance(value, dict) and value.get("url"):
        return str(value["url"])
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _parse_duration_seconds(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        if value.isdigit():
            return int(value)
        parts = [p for p in value.split(":") if p.strip().isdigit()]
        if not parts:
            return None
        try:
            if len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
            if len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        except ValueError:
            return None
    return None


def _artists_from_ytm(item: dict[str, Any]) -> list[str]:
    artists = item.get("artists")
    if isinstance(artists, list):
        out = []
        for entry in artists:
            if isinstance(entry, dict):
                name = (entry.get("name") or "").strip()
                if name:
                    out.append(name)
            elif isinstance(entry, str) and entry.strip():
                out.append(entry.strip())
        if out:
            return out
    byline = (item.get("byline") or item.get("author") or "").strip()
    if byline:
        return [a.strip() for a in re.split(r"[,/&]| feat\.? ", byline) if a.strip()]
    return ["Unknown"]


class YouTubeMusicNativeProvider(YtDlpCatalogProvider):
    """YouTube Music extractor via ytmusicapi with yt-dlp fallback."""

    def _ytm_client(self):
        try:
            from ytmusicapi import YTMusic
        except Exception as exc:
            raise ProviderError("YouTube Music: ytmusicapi is not installed") from exc
        return YTMusic()

    def _track_from_song(self, item: dict[str, Any], *, source_url: Optional[str] = None) -> Optional[Track]:
        video_id = str(item.get("videoId") or item.get("video_id") or "").strip()
        title = str(item.get("title") or "").strip()
        if not title:
            return None
        artists = _artists_from_ytm(item)
        if artists == ["Unknown"]:
            parsed_title, parsed_artists = _parse_creator_title(title)
            if parsed_artists:
                title = parsed_title
                artists = parsed_artists
        album = None
        album_field = item.get("album")
        if isinstance(album_field, dict):
            album = (album_field.get("name") or "").strip() or None
        elif isinstance(album_field, str):
            album = album_field.strip() or None

        duration = (
            _parse_duration_seconds(item.get("duration_seconds"))
            or _parse_duration_seconds(item.get("lengthSeconds"))
            or _parse_duration_seconds(item.get("duration"))
        )

        thumb = _pick_thumb_url(item.get("thumbnails") or item.get("thumbnail"))
        src = source_url
        if not src and video_id:
            src = f"https://music.youtube.com/watch?v={video_id}"

        return Track(
            provider=self.name,
            provider_id=video_id or title,
            title=title,
            artists=artists,
            album=album,
            duration_s=duration,
            cover_url=thumb,
            source_url=src,
        )

    def _extract_with_ytmusicapi(self, url: str) -> Optional[tuple[list[Track], Optional[str], str, int]]:
        parsed = urlparse(url)
        host = (parsed.netloc or "").lower()
        if "youtube.com" not in host and "youtu.be" not in host:
            return None

        qs = parse_qs(parsed.query or "")
        _list = qs.get("list") or []
        _vid = qs.get("v") or []
        playlist_id: str | None = _list[0] if _list else None
        video_id: str | None = _vid[0] if _vid else None
        path = parsed.path or ""
        path_parts = [p for p in path.split("/") if p]
        browse_id = path_parts[1] if len(path_parts) >= 2 and path_parts[0] == "browse" else None

        ytm = self._ytm_client()

        if playlist_id:
            data = ytm.get_playlist(playlist_id, limit=None)
            title = (data.get("title") or "").strip() or None
            tracks: list[Track] = []
            skipped = 0
            for entry in data.get("tracks") or []:
                track = self._track_from_song(entry)
                if track is None:
                    skipped += 1
                    continue
                tracks.append(track)
            if not tracks:
                raise ProviderError("YouTube Music: no available tracks in playlist")
            return tracks, title, "playlist", skipped

        if browse_id:
            data = ytm.get_album(browse_id)
            title = (data.get("title") or "").strip() or None
            album_tracks = data.get("tracks") or []
            tracks = [t for t in (self._track_from_song(entry) for entry in album_tracks) if t is not None]
            if not tracks:
                raise ProviderError("YouTube Music: album has no available tracks")
            return tracks, title, "album", max(0, len(album_tracks) - len(tracks))

        if video_id:
            data = ytm.get_song(video_id)
            details = data.get("videoDetails") or {}
            if not details:
                raise ProviderError("YouTube Music: track is unavailable")
            item = {
                "videoId": details.get("videoId") or video_id,
                "title": details.get("title"),
                "artists": [{"name": (details.get("author") or "").strip()}],
                "lengthSeconds": details.get("lengthSeconds"),
                "thumbnails": details.get("thumbnail", {}).get("thumbnails"),
            }
            track = self._track_from_song(item, source_url=f"https://music.youtube.com/watch?v={video_id}")
            if track is None:
                raise ProviderError("YouTube Music: track is unavailable")
            return [track], track.title, "track", 0

        return None

    def extract_raw_tracks(self, url: str) -> tuple[list[Track], Optional[str], str, int]:
        try:
            native = self._extract_with_ytmusicapi(url)
            if native is not None:
                return native
        except ProviderError as exc:
            logger.info("%s: ytmusicapi fallback to yt-dlp for %s: %s", self.name, url, exc)
        except Exception as exc:
            logger.warning("%s: ytmusicapi failed, fallback to yt-dlp for %s: %s", self.name, url, exc)
        return super().extract_raw_tracks(url)
