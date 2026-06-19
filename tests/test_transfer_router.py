"""Transfer router URL routing tests."""

from tidal_dl_ru.core.transfer_router import find_transfer_provider


class TestTransferRouter:
    def test_tidal_url(self):
        p = find_transfer_provider("https://tidal.com/browse/playlist/abc-123")
        assert p is not None
        assert p.name == "tidal"

    def test_spotify_url(self):
        p = find_transfer_provider("https://open.spotify.com/playlist/abc123")
        assert p is not None
        assert p.name == "spotify"

    def test_apple_url(self):
        p = find_transfer_provider("https://music.apple.com/us/playlist/name/pl.u-abc")
        assert p is not None
        assert p.name == "apple"

    def test_yandex_url(self):
        p = find_transfer_provider("https://music.yandex.ru/playlist/123")
        assert p is not None
        assert p.name == "yandex"

    def test_ytmusic_url(self):
        p = find_transfer_provider("https://music.youtube.com/playlist?list=abc")
        assert p is not None
        assert p.name == "ytmusic"

    def test_vk_url(self):
        p = find_transfer_provider("https://vk.com/audio?section=playlist_1")
        assert p is not None
        assert p.name == "vk"

    def test_soundcloud_url(self):
        p = find_transfer_provider("https://soundcloud.com/artist/sets/album")
        assert p is not None
        assert p.name == "soundcloud"

    def test_deezer_url(self):
        p = find_transfer_provider("https://www.deezer.com/playlist/123")
        assert p is not None
        assert p.name == "deezer"

    def test_unknown_url(self):
        assert find_transfer_provider("https://example.com/playlist/1") is None
