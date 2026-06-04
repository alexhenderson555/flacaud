"""Tests for active lyric index helper (mirrors frontend getActiveLyricIndex)."""


def active_lyric_index(lyrics, current_time: float) -> int:
    if not lyrics:
        return -1
    if current_time < lyrics[0]["time"]:
        return 0
    idx = 0
    for i, line in enumerate(lyrics):
        if current_time >= line["time"]:
            idx = i
        else:
            break
    return idx


def test_first_line_active_during_intro():
    lyrics = [{"time": 5.0, "text": "A"}, {"time": 12.0, "text": "B"}]
    assert active_lyric_index(lyrics, 0) == 0
    assert active_lyric_index(lyrics, 4.9) == 0


def test_line_switches_at_timestamp():
    lyrics = [{"time": 5.0, "text": "A"}, {"time": 12.0, "text": "B"}]
    assert active_lyric_index(lyrics, 5.0) == 0
    assert active_lyric_index(lyrics, 12.0) == 1


def test_empty_lyrics():
    assert active_lyric_index([], 10) == -1
