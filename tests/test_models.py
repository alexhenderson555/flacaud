"""Tests for core.models — universal data models."""

from tidal_dl_ru.core.models import Album, Playlist, Quality, Track


def test_quality_enum_values():
    assert Quality.LOW == "LOW"
    assert Quality.HIGH == "HIGH"
    assert Quality.LOSSLESS == "LOSSLESS"
    assert Quality.HI_RES == "HI_RES"


def test_track_primary_artist():
    t = Track(provider="tidal", provider_id="123", title="Song", artists=["A", "B"])
    assert t.primary_artist == "A"


def test_track_primary_artist_empty():
    t = Track(provider="tidal", provider_id="123", title="Song", artists=[])
    assert t.primary_artist == "Unknown"


def test_track_defaults():
    t = Track(provider="tidal", provider_id="1", title="X", artists=["Y"])
    assert t.track_number == 1
    assert t.disc_number == 1
    assert t.explicit is False
    assert t.album is None
    assert t.isrc is None
    assert t.source_url is None


def test_track_extra_fields_ignored():
    """Pydantic model_config has extra='ignore'."""
    t = Track(
        provider="tidal",
        provider_id="1",
        title="X",
        artists=["Y"],
        unknown_field="should be ignored",
    )
    assert not hasattr(t, "unknown_field")


def test_album_model():
    a = Album(provider="tidal", provider_id="42", title="Album", artist="Artist")
    assert a.title == "Album"
    assert a.track_count is None


def test_playlist_model():
    p = Playlist(provider="tidal", provider_id="abc", title="My Playlist")
    assert p.track_count is None
    assert p.source_url is None
