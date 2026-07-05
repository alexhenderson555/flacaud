"""Tests for catalog.py helper functions — no Tidal API needed."""

import pytest
from fastapi import HTTPException

from tidal_dl_ru.server.routers.catalog import _parse_exclude_ids
from tidal_dl_ru.server.routers.ai_playlist import (
    _artist_name_matches,
    _clean_artist_query_name,
    _extract_artist_focus,
    _extract_artist_similar,
    _library_seed_titles_from_query,
    _looks_like_vibe_prompt,
    _normalize_ai_query,
    _strip_artist_focus_filler,
    _vibe_fallback_search_terms,
)


class TestParseExcludeIds:
    def test_none(self):
        assert _parse_exclude_ids(None) == set()

    def test_empty(self):
        assert _parse_exclude_ids("") == set()

    def test_single(self):
        assert _parse_exclude_ids("123") == {"123"}

    def test_multiple(self):
        assert _parse_exclude_ids("1,2,3") == {"1", "2", "3"}

    def test_with_spaces(self):
        assert _parse_exclude_ids(" 1 , 2 , 3 ") == {"1", "2", "3"}

    def test_too_many(self):
        ids = ",".join(str(i) for i in range(251))
        with pytest.raises(HTTPException, match="Too many"):
            _parse_exclude_ids(ids)


class TestNormalizeAiQuery:
    def test_basic(self):
        assert _normalize_ai_query("Daft Punk") == "Daft Punk"

    def test_strips_prefix(self):
        assert _normalize_ai_query("Play tracks similar to Daft Punk") == "Daft Punk"

    def test_strips_russian_prefix(self):
        assert _normalize_ai_query("Сыграй треки, похожие на Daft Punk") == "Daft Punk"

    def test_strips_trailing_dot(self):
        assert _normalize_ai_query("Daft Punk.") == "Daft Punk"

    def test_strips_by_clause(self):
        assert _normalize_ai_query("Songs by Artist") == "Songs"

    def test_empty_returns_original(self):
        assert _normalize_ai_query("  ") == "  "


class TestLibrarySeedTitlesFromQuery:
    def test_basic(self):
        q = "I like these songs: Song A; Song B; Song C. Give me a radio mix based on this taste"
        titles = _library_seed_titles_from_query(q)
        assert titles is not None
        assert "Song A" in titles
        assert "Song B" in titles

    def test_no_match(self):
        assert _library_seed_titles_from_query("just a regular query") == []


class TestStripArtistFocusFiller:
    def test_basic(self):
        assert _strip_artist_focus_filler("play Daft Punk") == "Daft Punk"

    def test_multiple(self):
        assert _strip_artist_focus_filler("play give me Daft Punk") == "Daft Punk"

    def test_no_filler(self):
        assert _strip_artist_focus_filler("Daft Punk") == "Daft Punk"


class TestCleanArtistQueryName:
    def test_basic(self):
        assert _clean_artist_query_name("Daft Punk") == "Daft Punk"

    def test_strips_punctuation(self):
        assert _clean_artist_query_name('"Daft Punk"') == "Daft Punk"

    def test_too_short(self):
        assert _clean_artist_query_name("A") is None

    def test_empty(self):
        assert _clean_artist_query_name("") is None

    def test_too_long(self):
        assert _clean_artist_query_name("A" * 81) is None


class TestExtractArtistSimilar:
    def test_english(self):
        result = _extract_artist_similar("tracks like Daft Punk")
        assert result == "Daft Punk"

    def test_no_match(self):
        assert _extract_artist_similar("just a query") is None

    def test_with_semicolon_no_match(self):
        assert _extract_artist_similar("tracks like Daft Punk; other stuff") is None


class TestExtractArtistFocus:
    def test_suffix_pattern(self):
        # "moojo tracks" → artist focus
        result = _extract_artist_focus("moojo tracks")
        assert result is not None

    def test_no_match(self):
        assert _extract_artist_focus("just a regular query") is None


class TestArtistNameMatches:
    def test_exact(self):
        assert _artist_name_matches("Daft Punk", "Daft Punk") is True

    def test_case_insensitive(self):
        assert _artist_name_matches("daft punk", "Daft Punk") is True

    def test_substring(self):
        assert _artist_name_matches("Daft Punk", "Daft") is True

    def test_no_match(self):
        assert _artist_name_matches("Daft Punk", "Radiohead") is False

    def test_empty(self):
        assert _artist_name_matches("", "Daft Punk") is False
        assert _artist_name_matches("Daft Punk", "") is False


class TestLooksLikeVibePrompt:
    def test_vibe(self):
        assert _looks_like_vibe_prompt("chill summer vibes") is True

    def test_artist_focus_not_vibe(self):
        assert _looks_like_vibe_prompt("Daft Punk tracks") is False

    def test_artist_similar_not_vibe(self):
        assert _looks_like_vibe_prompt("tracks like Daft Punk") is False

    def test_with_semicolon_not_vibe(self):
        assert _looks_like_vibe_prompt("Song A; Song B") is False

    def test_empty(self):
        assert _looks_like_vibe_prompt("") is False

    def test_too_long(self):
        assert _looks_like_vibe_prompt("x" * 100) is False


class TestVibeFallbackSearchTerms:
    def test_basic(self):
        terms = _vibe_fallback_search_terms("chill summer vibes")
        assert isinstance(terms, list)
        assert len(terms) > 0

    def test_empty(self):
        terms = _vibe_fallback_search_terms("")
        assert isinstance(terms, list)
