"""Tests for set_track_match -- Tidal search-query construction and fallback."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tidal_dl_ru.core.set_track_match import (
    _search_query_candidates,
    dedupe_key,
    match_tidal_track,
)


class TestSearchQueryCandidates:
    def test_strips_ampersand_and_comma_from_primary_query(self):
        queries = _search_query_candidates("AN21 & Pretty Output", "Run")
        assert queries[0] == "AN21 Pretty Output Run"
        assert "&" not in queries[0]

        queries = _search_query_candidates("AN21, Pretty Output", "Run")
        assert queries[0] == "AN21 Pretty Output Run"
        assert "," not in queries[0]

    def test_includes_primary_artist_fallback_for_multi_artist_credit(self):
        queries = _search_query_candidates("AN21 & Pretty Output", "Run")
        assert "AN21 Run" in queries

    def test_includes_title_only_last_resort(self):
        queries = _search_query_candidates("AN21 & Pretty Output", "Run")
        assert queries[-1] == "Run"

    def test_single_artist_has_no_redundant_primary_fallback(self):
        queries = _search_query_candidates("AN21", "Run")
        assert queries == ["AN21 Run", "Run"]


class TestMatchTidalTrack:
    @pytest.mark.asyncio
    async def test_falls_back_to_simpler_query_when_first_returns_nothing(self):
        provider = MagicMock()
        track = MagicMock()
        track.model_dump.return_value = {"title": "Run", "artists": ["AN21", "Pretty Output"]}
        # First query (sanitized full query) returns nothing, second (primary
        # artist) finds it.
        provider.search.side_effect = [[], [track]]

        with patch(
            "tidal_dl_ru.core.set_track_match.get_provider_by_name",
            return_value=provider,
        ):
            result = await match_tidal_track("AN21 & Pretty Output", "Run")

        assert result == {"title": "Run", "artists": ["AN21", "Pretty Output"]}
        assert provider.search.call_count == 2

    @pytest.mark.asyncio
    async def test_continues_past_a_query_that_raises(self):
        provider = MagicMock()
        track = MagicMock()
        track.model_dump.return_value = {"title": "Run", "artists": ["AN21"]}
        provider.search.side_effect = [Exception("500"), [track]]

        with patch(
            "tidal_dl_ru.core.set_track_match.get_provider_by_name",
            return_value=provider,
        ):
            result = await match_tidal_track("AN21 & Pretty Output", "Run")

        assert result == {"title": "Run", "artists": ["AN21"]}

    @pytest.mark.asyncio
    async def test_no_provider_returns_none(self):
        with patch("tidal_dl_ru.core.set_track_match.get_provider_by_name", return_value=None):
            assert await match_tidal_track("Artist", "Title") is None

    @pytest.mark.asyncio
    async def test_all_queries_fail_returns_none(self):
        provider = MagicMock()
        provider.search.return_value = []
        with patch(
            "tidal_dl_ru.core.set_track_match.get_provider_by_name",
            return_value=provider,
        ):
            result = await match_tidal_track("AN21 & Pretty Output", "Run")
        assert result is None


def test_dedupe_key_still_works():
    assert dedupe_key("AN21", "Run (Extended Mix)") == "an21|run"
