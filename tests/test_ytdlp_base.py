"""Tests for yt-dlp catalog extraction (skip unavailable entries)."""

from unittest.mock import MagicMock, patch

import pytest
import yt_dlp

from tidal_dl_ru.providers.catalog_providers import YouTubeMusicProvider
from tidal_dl_ru.providers.ytdlp_base import _is_unavailable_entry, _parse_creator_title, _resolve_entry_metadata


class TestYtDlpUnavailable:
    def test_parse_creator_title_splits_artist(self):
        title, artists = _parse_creator_title("James Mac - The Boy Is Mine (feat. Rosalie)")
        assert title == "The Boy Is Mine (feat. Rosalie)"
        assert artists == ["James Mac"]

    def test_resolve_entry_metadata_from_flat_yt_title(self):
        title, artists = _resolve_entry_metadata(
            {"title": "BRY - VIBES", "uploader": "BRY - Topic"},
        )
        assert title == "VIBES"
        assert artists == ["BRY"]

    def test_is_unavailable_entry_detects_private(self):
        assert _is_unavailable_entry({"title": "[Private video]", "id": "x"})
        assert not _is_unavailable_entry({"title": "Real Song", "id": "x"})

    @patch("tidal_dl_ru.providers.ytdlp_base.yt_dlp.YoutubeDL")
    def test_playlist_skips_unavailable_video(self, mock_ydl_cls):
        provider = YouTubeMusicProvider()
        flat_instance = MagicMock()
        flat_instance.extract_info.return_value = {
            "_type": "playlist",
            "playlist_title": "Mix",
            "entries": [
                {"id": "ok1", "title": "Song One", "duration": 200, "uploader": "Artist"},
                {"id": "bad", "title": "[Deleted video]"},
                {"id": "ok2", "title": "Song Two", "duration": 180, "uploader": "Artist"},
            ],
        }
        mock_ydl_cls.return_value.__enter__.return_value = flat_instance

        tracks, title, kind, skipped = provider.extract_raw_tracks(
            "https://music.youtube.com/playlist?list=PLtest"
        )
        assert title == "Mix"
        assert kind == "playlist"
        assert skipped == 1
        assert len(tracks) == 2
        assert tracks[0].title == "Song One"

    @patch("tidal_dl_ru.providers.ytdlp_base.yt_dlp.YoutubeDL")
    def test_playlist_skips_failed_full_extract(self, mock_ydl_cls):
        provider = YouTubeMusicProvider()
        flat = MagicMock()
        full = MagicMock()
        flat.extract_info.return_value = {
            "_type": "playlist",
            "playlist_title": "Mix",
            "entries": [
                {"id": "needmeta", "url": "https://music.youtube.com/watch?v=needmeta"},
                {"id": "ok", "title": "Known", "duration": 100, "uploader": "A"},
            ],
        }

        def extract(url, download=False):
            if "needmeta" in url:
                raise yt_dlp.DownloadError("Video unavailable")
            return {"id": "ok", "title": "Known", "duration": 100, "uploader": "A"}

        full.extract_info.side_effect = extract
        mock_ydl_cls.return_value.__enter__.side_effect = [flat, full]

        tracks, _title, _kind, skipped = provider.extract_raw_tracks(
            "https://music.youtube.com/playlist?list=PLtest"
        )
        assert skipped == 1
        assert len(tracks) == 1
        assert tracks[0].title == "Known"
