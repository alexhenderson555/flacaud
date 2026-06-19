from __future__ import annotations

from unittest.mock import patch

from tidal_dl_ru.providers.catalog_providers import YouTubeMusicProvider


class _FakeYTMusic:
    def get_playlist(self, playlist_id: str, limit=None):
        assert playlist_id == "PL123"
        return {
            "title": "Native Mix",
            "tracks": [
                {
                    "videoId": "v1",
                    "title": "VIBES",
                    "artists": [{"name": "stibens"}],
                    "duration_seconds": 210,
                    "thumbnails": [{"url": "https://img/1.jpg"}],
                },
                {
                    "videoId": "v2",
                    "title": "Night Ride",
                    "artists": [{"name": "Another Artist"}],
                    "duration": "3:44",
                    "thumbnails": [{"url": "https://img/2.jpg"}],
                },
            ],
        }


def test_ytmusic_playlist_uses_native_metadata():
    provider = YouTubeMusicProvider()
    provider._ytm_client = lambda: _FakeYTMusic()

    tracks, title, kind, skipped = provider.extract_raw_tracks("https://music.youtube.com/playlist?list=PL123")

    assert title == "Native Mix"
    assert kind == "playlist"
    assert skipped == 0
    assert len(tracks) == 2
    assert tracks[0].title == "VIBES"
    assert tracks[0].artists == ["stibens"]
    assert tracks[0].provider_id == "v1"
    assert tracks[1].duration_s == 224


def test_ytmusic_falls_back_to_ytdlp_on_native_failure():
    provider = YouTubeMusicProvider()
    provider._ytm_client = lambda: (_ for _ in ()).throw(RuntimeError("boom"))

    fallback = ([], None, "unknown", 0)
    with patch("tidal_dl_ru.providers.ytdlp_base.YtDlpCatalogProvider.extract_raw_tracks", return_value=fallback) as mocked:
        result = provider.extract_raw_tracks("https://music.youtube.com/watch?v=test")

    assert result == fallback
    mocked.assert_called_once()


def test_ytmusic_parses_artist_title_when_artists_missing():
    class _NoArtistYTMusic:
        def get_playlist(self, playlist_id: str, limit=None):
            assert playlist_id == "PLNOART"
            return {
                "title": "No artists",
                "tracks": [
                    {
                        "videoId": "v3",
                        "title": "BRY - VIBES",
                        "artists": [],
                        "duration": "3:14",
                    }
                ],
            }

    provider = YouTubeMusicProvider()
    provider._ytm_client = lambda: _NoArtistYTMusic()

    tracks, _title, _kind, _skipped = provider.extract_raw_tracks("https://music.youtube.com/playlist?list=PLNOART")
    assert tracks[0].title == "VIBES"
    assert tracks[0].artists == ["BRY"]
