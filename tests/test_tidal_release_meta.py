"""Release year from Tidal streamStartDate and album fetch."""

from unittest.mock import MagicMock

from tidal_dl_ru.providers.tidal.models import Album
from tidal_dl_ru.providers.tidal.models import Track as TidalTrack
from tidal_dl_ru.providers.tidal.provider import _to_universal, to_universal_enriched


def test_stream_start_date_becomes_year():
    t = TidalTrack.model_validate(
        {
            "id": 1,
            "title": "Hit",
            "duration": 200,
            "trackNumber": 1,
            "streamStartDate": "2017-12-05T00:00:00.000+0000",
            "artists": [{"id": 9, "name": "Artist"}],
            "album": {"id": 2, "title": "Album"},
        }
    )
    uni = _to_universal(t)
    assert uni.year == 2017
    assert uni.release_date == "2017-12-05"


def test_album_fetch_when_stub_has_no_dates():
    t = TidalTrack.model_validate(
        {
            "id": 1,
            "title": "Hit",
            "duration": 200,
            "trackNumber": 1,
            "artists": [{"id": 9, "name": "Artist"}],
            "album": {"id": 99, "title": "Album"},
        }
    )
    client = MagicMock()
    client.get_album.return_value = Album.model_validate(
        {"id": 99, "title": "Album", "releaseDate": "2020-03-15"}
    )
    uni = to_universal_enriched(client, t)
    assert uni.year == 2020
    assert uni.release_date == "2020-03-15"
    client.get_album.assert_called_once_with("99")
