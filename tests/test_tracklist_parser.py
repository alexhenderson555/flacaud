from tidal_dl_ru.core.tracklist_parser import parse_tracklist_from_description

SAMPLE = """
Live set recorded at the club.

00:00 Artist One - Track One
03:45 Artist Two - Track Two (Extended Mix)
07:12 Artist Three - Track Three
1:02:30 Artist Four - Track Four

Follow us on Instagram!
"""

NUMBERED = """
Tracklist:
1. 00:00 DJ A - Song A
2. 04:10 DJ B - Song B
3. 08:20 DJ C - Song C
"""

BRACKETED = """
[00:00] Foo - Bar
[03:30] Baz - Qux
[07:00] Zed - Yow
"""


def test_parses_basic_tracklist():
    rows = parse_tracklist_from_description(SAMPLE)
    assert len(rows) == 4
    assert rows[0] == {"timestamp": "00:00", "artist": "Artist One", "title": "Track One"}
    assert rows[3]["timestamp"] == "1:02:30"
    assert rows[3]["artist"] == "Artist Four"


def test_parses_numbered_lines():
    rows = parse_tracklist_from_description(NUMBERED)
    assert [r["artist"] for r in rows] == ["DJ A", "DJ B", "DJ C"]


def test_parses_bracketed_timestamps():
    rows = parse_tracklist_from_description(BRACKETED)
    assert len(rows) == 3
    assert rows[1] == {"timestamp": "03:30", "artist": "Baz", "title": "Qux"}


def test_ignores_descriptions_without_a_real_tracklist():
    assert parse_tracklist_from_description("") == []
    assert parse_tracklist_from_description("Just a normal description, no timestamps.") == []
    # A single stray timestamp-looking line isn't a tracklist.
    assert parse_tracklist_from_description("Uploaded at 00:01 today - enjoy!") == []


def test_dedupes_repeated_timestamps():
    text = "00:00 A - B\n00:00 A - B\n03:00 C - D\n06:00 E - F"
    rows = parse_tracklist_from_description(text)
    assert len(rows) == 3
