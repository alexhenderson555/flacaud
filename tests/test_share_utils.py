"""Tests for share utilities."""

from tidal_dl_ru.server.share_utils import (
    new_share_token,
    parse_tracks_json,
    sum_track_durations,
    track_duration_seconds,
)


def test_new_share_token_unique():
    t1 = new_share_token()
    t2 = new_share_token()
    assert t1 != t2
    assert len(t1) <= 10


def test_parse_tracks_json_valid():
    assert parse_tracks_json('[{"title": "A"}]') == [{"title": "A"}]


def test_parse_tracks_json_empty():
    assert parse_tracks_json("") == []
    assert parse_tracks_json(None) == []


def test_parse_tracks_json_invalid():
    assert parse_tracks_json("not json") == []


def test_parse_tracks_json_not_list():
    assert parse_tracks_json('{"key": "val"}') == []


def test_track_duration_seconds_various_keys():
    assert track_duration_seconds({"duration": 30}) == 30
    assert track_duration_seconds({"duration_s": 45}) == 45
    assert track_duration_seconds({"duration_seconds": 60}) == 60
    assert track_duration_seconds({"duration": 0}) == 0
    assert track_duration_seconds({"duration": -5}) == 0
    assert track_duration_seconds({}) == 0
    assert track_duration_seconds({"duration": "abc"}) == 0


def test_sum_track_durations():
    tracks = [
        {"duration": 30},
        {"duration_s": 45},
        {"duration_seconds": 60},
        {},
    ]
    assert sum_track_durations(tracks) == 135
