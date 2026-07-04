"""Unit tests for Set Analyzer query cleaning / dedupe helpers."""

from tidal_dl_ru.core.set_analyzer import _clean_title_for_query, _dedupe_key


def test_clean_title_strips_version_tags():
    assert _clean_title_for_query("Kidz (Extended Mix)") == "Kidz"
    assert _clean_title_for_query("Bare Earth (Radio Edit)") == "Bare Earth"
    assert _clean_title_for_query("Alma (Original Mix)") == "Alma"
    assert _clean_title_for_query("Some Track - Extended Mix") == "Some Track"


def test_clean_title_keeps_remix():
    # A remix is a different recording — must NOT be stripped.
    assert _clean_title_for_query("Timeless (Arodes Remix)") == "Timeless (Arodes Remix)"


def test_clean_title_passthrough():
    assert _clean_title_for_query("Occidente") == "Occidente"
    assert _clean_title_for_query("") == ""


def test_dedupe_key_merges_versions_not_remixes():
    assert _dedupe_key("Arodes", "Kidz") == _dedupe_key("Arodes", "Kidz (Extended Mix)")
    assert _dedupe_key("The Weeknd", "Timeless") != _dedupe_key("The Weeknd", "Timeless (Arodes Remix)")
    # Different artist, same title → different key.
    assert _dedupe_key("A", "Song") != _dedupe_key("B", "Song")
