"""Unit tests for the Yandex/VK (unofficial, token-paste) connector track parsing.

These are pure-function tests on the row->Track mapping — no network, no real
tokens. Live behavior against the actual APIs still needs manual verification
with a real account (flagged in the commit/PR — these libs are reverse-engineered
and can change without notice).
"""

from types import SimpleNamespace

from tidal_dl_ru.providers.connectors.vk_connector import _vk_track
from tidal_dl_ru.providers.connectors.yandex_connector import _ya_track
from tidal_dl_ru.providers.user_library import ConnectorError


def test_vk_track_parses_basic_fields():
    track = _vk_track({
        "id": 123, "owner_id": 456, "title": "Song", "artist": "Artist", "duration": 210,
    })
    assert track is not None
    assert track.provider == "vk"
    assert track.provider_id == "456_123"
    assert track.title == "Song"
    assert track.artists == ["Artist"]
    assert track.duration_s == 210


def test_vk_track_missing_id_or_owner_returns_none():
    assert _vk_track({"title": "X", "owner_id": 1}) is None
    assert _vk_track({"title": "X", "id": 1}) is None


def test_vk_track_defaults_artist_and_duration():
    track = _vk_track({"id": 1, "owner_id": 2, "title": "T"})
    assert track.artists == ["Unknown"]
    assert track.duration_s is None


def _ya_artist(name):
    return SimpleNamespace(name=name)


def _ya_album(title):
    return SimpleNamespace(title=title)


def test_ya_track_parses_basic_fields():
    t = SimpleNamespace(
        id=42,
        title="Song",
        artists=[_ya_artist("Artist")],
        albums=[_ya_album("Album")],
        duration_ms=185_000,
    )
    track = _ya_track(t)
    assert track is not None
    assert track.provider == "yandex"
    assert track.provider_id == "42"
    assert track.title == "Song"
    assert track.artists == ["Artist"]
    assert track.album == "Album"
    assert track.duration_s == 185


def test_ya_track_none_input_returns_none():
    assert _ya_track(None) is None


def test_ya_track_missing_id_returns_none():
    t = SimpleNamespace(id=None, title="X", artists=[], albums=[], duration_ms=0)
    assert _ya_track(t) is None


def test_ya_track_defaults_when_no_artists_or_album():
    t = SimpleNamespace(id=1, title="T", artists=[], albums=[], duration_ms=None)
    track = _ya_track(t)
    assert track.artists == ["Unknown"]
    assert track.album is None
    assert track.duration_s is None


def test_connector_error_is_a_normal_exception():
    # Sanity check the shared error type connectors raise on API failures.
    try:
        raise ConnectorError("boom")
    except ConnectorError as exc:
        assert str(exc) == "boom"
