from tidal_dl_ru.providers.tidal.client import TidalClient
from tidal_dl_ru.providers.tidal.models import Track


def test_items_to_tracks_wraps_item_key():
    client = TidalClient.__new__(TidalClient)
    data = {
        "items": [
            {
                "type": "track",
                "item": {
                    "id": 1,
                    "title": "A",
                    "duration": 200,
                    "trackNumber": 1,
                    "volumeNumber": 1,
                    "explicit": False,
                },
            }
        ]
    }
    tracks = client._items_to_tracks(data)
    assert len(tracks) == 1
    assert isinstance(tracks[0], Track)
    assert tracks[0].title == "A"
