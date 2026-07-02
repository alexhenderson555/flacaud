"""Tests for worker.py utility functions."""

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.server.worker import _album_subdir, _filename, _safe


class TestSafe:
    def test_basic(self):
        assert _safe("Hello World") == "Hello World"

    def test_strips_invalid_chars(self):
        assert _safe('file<>:"/\\|?*name') == "file_________name"

    def test_strips_control_chars(self):
        assert _safe("file\x00\x01name") == "file__name"

    def test_truncates(self):
        long = "A" * 200
        assert len(_safe(long, max_len=50)) == 50

    def test_empty_returns_underscore(self):
        assert _safe("") == "_"

    def test_only_invalid_returns_underscores(self):
        # All invalid chars replaced with _, strip removes trailing, but result is non-empty
        result = _safe('<>:"/\\|?*')
        assert all(c == "_" for c in result)
        assert len(result) > 0

    def test_strips_trailing_dot_space(self):
        assert _safe("file. ") == "file"


class TestFilename:
    def test_basic(self):
        t = Track(
            provider="tidal", provider_id="1", title="Song",
            artists=["Artist"], track_number=3,
        )
        name = _filename(t)
        assert "03" in name
        assert "Artist" in name
        assert "Song" in name


class TestAlbumSubdir:
    def test_with_album(self):
        t = Track(
            provider="tidal", provider_id="1", title="Song",
            artists=["Artist"], album="Album Name",
        )
        subdir = _album_subdir(t)
        assert "Album Name" in subdir
        assert "Artist" in subdir

    def test_with_album_and_year(self):
        t = Track(
            provider="tidal", provider_id="1", title="Song",
            artists=["Artist"], album="Album", year=2024,
        )
        subdir = _album_subdir(t)
        assert "2024" in subdir

    def test_no_album(self):
        t = Track(
            provider="tidal", provider_id="1", title="Song",
            artists=["Artist"],
        )
        subdir = _album_subdir(t)
        assert "Singles" in subdir
        assert "tidal" in subdir

    def test_album_artist_overrides(self):
        t = Track(
            provider="tidal", provider_id="1", title="Song",
            artists=["Artist"], album="Album",
            album_artist="Album Artist",
        )
        subdir = _album_subdir(t)
        assert "Album Artist" in subdir
