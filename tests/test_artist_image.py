"""Tests for artist portrait lookup (Wikimedia / Deezer / iTunes)."""

from unittest.mock import MagicMock, patch

import pytest

from tidal_dl_ru.server import artist_image_cache
from tidal_dl_ru.server.artist_image import (
    _wiki_title_matches,
    fetch_deezer_artist_image,
    fetch_itunes_artist_image,
    fetch_wikimedia_artist_image,
    names_match,
    resolve_artist_picture_url,
)


@pytest.fixture(autouse=True)
def clear_artist_image_cache():
    artist_image_cache._store.clear()
    yield
    artist_image_cache._store.clear()


def test_names_match_folds_the_and_case():
    assert names_match("The Weeknd", "weeknd")
    assert names_match("Daft Punk", "DAFT PUNK")
    assert not names_match("Radiohead", "Head Radio")


def test_wiki_title_matches_band_suffix():
    assert _wiki_title_matches("Radiohead", "Radiohead (band)")
    assert _wiki_title_matches("Morgenshtern", "Morgenshtern")


@patch(
    "tidal_dl_ru.server.artist_image._wiki_page_image",
    return_value="https://upload.wikimedia.org/wikipedia/commons/thumb/a.jpg",
)
@patch(
    "tidal_dl_ru.server.artist_image._wiki_search_titles",
    return_value=["Star Artist (musician)"],
)
def test_fetch_wikimedia_artist_image(_search, _image):
    url = fetch_wikimedia_artist_image("Star Artist")
    assert url and "wikimedia.org" in url


@patch("tidal_dl_ru.server.artist_image.httpx.Client")
def test_fetch_deezer_artist_image(mock_client_cls):
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "data": [
            {"name": "Wrong Artist", "picture_xl": "https://e-cdns-images.dzcdn.net/wrong.jpg"},
            {"name": "Star Artist", "picture_xl": "https://e-cdns-images.dzcdn.net/star.jpg"},
        ],
    }
    http = MagicMock()
    http.get.return_value = response
    http.__enter__.return_value = http
    http.__exit__.return_value = False
    mock_client_cls.return_value = http

    assert fetch_deezer_artist_image("Star Artist") == "https://e-cdns-images.dzcdn.net/star.jpg"


@patch("tidal_dl_ru.server.artist_image.httpx.Client")
def test_fetch_itunes_artist_image_upscales_artwork(mock_client_cls):
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "results": [
            {
                "artistName": "Star Artist",
                "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg",
            },
        ],
    }
    http = MagicMock()
    http.get.return_value = response
    http.__enter__.return_value = http
    http.__exit__.return_value = False
    mock_client_cls.return_value = http

    url = fetch_itunes_artist_image("Star Artist")
    assert "600x600bb" in url
    assert "mzstatic.com" in url


@patch(
    "tidal_dl_ru.server.artist_image.fetch_wikimedia_artist_image",
    return_value="https://upload.wikimedia.org/wikipedia/commons/a/star.jpg",
)
def test_resolve_prefers_wikimedia(mock_wiki):
    url, source = resolve_artist_picture_url(
        "Star Artist",
        artist_id="1",
        tidal_picture_id="tid-pic",
        tidal_cover_url_fn=lambda pic, size=640: f"https://resources.tidal.com/{pic}/{size}",
    )
    assert source == "wikimedia"
    assert "wikimedia.org" in url
    mock_wiki.assert_called_once()


@patch("tidal_dl_ru.server.artist_image.fetch_wikimedia_artist_image", return_value=None)
@patch(
    "tidal_dl_ru.server.artist_image.fetch_deezer_artist_image",
    return_value="https://e-cdns-images.dzcdn.net/star.jpg",
)
def test_resolve_falls_back_to_deezer(_wiki, _deezer):
    url, source = resolve_artist_picture_url(
        "Star Artist",
        artist_id="1",
        tidal_picture_id="abc",
        tidal_cover_url_fn=lambda pic, size=640: f"https://resources.tidal.com/{pic}/{size}",
    )
    assert source == "deezer"
    assert "dzcdn.net" in url


@patch("tidal_dl_ru.server.artist_image.fetch_wikimedia_artist_image", return_value=None)
@patch("tidal_dl_ru.server.artist_image.fetch_deezer_artist_image", return_value=None)
@patch(
    "tidal_dl_ru.server.artist_image.fetch_itunes_artist_image",
    return_value="https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg",
)
def test_resolve_falls_back_to_itunes(_wiki, _deezer, _itunes):
    url, source = resolve_artist_picture_url(
        "Star Artist",
        artist_id="1",
        tidal_picture_id="abc",
        tidal_cover_url_fn=lambda pic, size=640: f"https://resources.tidal.com/{pic}/{size}",
    )
    assert source == "itunes"
    assert "mzstatic.com" in url


@patch("tidal_dl_ru.server.artist_image.fetch_wikimedia_artist_image", return_value=None)
@patch("tidal_dl_ru.server.artist_image.fetch_deezer_artist_image", return_value=None)
@patch("tidal_dl_ru.server.artist_image.fetch_itunes_artist_image", return_value=None)
def test_resolve_falls_back_to_tidal(_wiki, _deezer, _itunes):
    url, source = resolve_artist_picture_url(
        "Star Artist",
        artist_id="1",
        tidal_picture_id="abc",
        tidal_cover_url_fn=lambda pic, size=640: f"https://resources.tidal.com/{pic}/{size}",
    )
    assert source == "tidal"
    assert "tidal.com" in url
