"""Tests for set_track_match -- Tidal search-query construction, fallback, and
result scoring (blindly trusting the API's #1 hit was itself a false-negative/
false-positive source, on top of the &/, query bug)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from tidal_dl_ru.core.set_track_match import (
    _match_score,
    _search_query_candidates,
    dedupe_key,
    match_tidal_track,
)


def _track(title: str, artists: list) -> MagicMock:
    tr = MagicMock()
    tr.title = title
    tr.artists = artists
    tr.model_dump.return_value = {"title": title, "artists": artists}
    return tr


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


class TestMatchScore:
    def test_exact_match_scores_high(self):
        score = _match_score("Run", ["AN21", "Pretty Output"], "AN21 & Pretty Output", "Run")
        assert score > 0.9

    def test_unrelated_track_scores_low(self):
        # The real false-positive hit seen live: "Robin M Tromlitz" query's #1
        # result was "Show Me Love" by Robin S -- shares nothing meaningful
        # with the actual wanted title.
        score = _match_score(
            "Show Me Love", ["Robin S"], "Robin M, Robin Michelangelo", "Tromlitz (Radio Edit)",
        )
        assert score < 0.5

    def test_correct_track_scores_higher_than_false_positive(self):
        false_positive = _match_score(
            "Show Me Love", ["Robin S"], "Robin M, Robin Michelangelo", "Tromlitz (Radio Edit)",
        )
        correct = _match_score(
            "Tromlitz (Radio Edit)", ["Robin M", "Robin Michelangelo"],
            "Robin M, Robin Michelangelo", "Tromlitz (Radio Edit)",
        )
        assert correct > false_positive


class TestMatchTidalTrack:
    @pytest.mark.asyncio
    async def test_falls_back_to_simpler_query_when_first_returns_nothing(self):
        provider = MagicMock()
        # First query (sanitized full query) returns nothing, second (primary
        # artist) finds it.
        provider.search.side_effect = [[], [_track("Run", ["AN21", "Pretty Output"])]]

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
        provider.search.side_effect = [Exception("500"), [_track("Run", ["AN21"])]]

        with patch(
            "tidal_dl_ru.core.set_track_match.get_provider_by_name",
            return_value=provider,
        ):
            result = await match_tidal_track("AN21 & Pretty Output", "Run")

        assert result == {"title": "Run", "artists": ["AN21"]}

    @pytest.mark.asyncio
    async def test_picks_correct_track_even_when_ranked_second(self):
        """Regression: the real live case where the API's own #1 hit for
        "Robin M Tromlitz" was an unrelated "Show Me Love" by Robin S, with
        the actual track second. Blindly taking index [0] would return the
        wrong track; scoring must pick the real one instead."""
        provider = MagicMock()
        provider.search.return_value = [
            _track("Show Me Love", ["Robin S"]),
            _track("Tromlitz (Radio Edit)", ["Robin M", "Robin Michelangelo"]),
            _track("Show Me Love (feat. Robin S)", ["Steve Angello", "Laidback Luke"]),
        ]

        with patch(
            "tidal_dl_ru.core.set_track_match.get_provider_by_name",
            return_value=provider,
        ):
            result = await match_tidal_track("Robin M, Robin Michelangelo", "Tromlitz (Radio Edit)")

        assert result["title"] == "Tromlitz (Radio Edit)"
        assert result["artists"] == ["Robin M", "Robin Michelangelo"]

    @pytest.mark.asyncio
    async def test_low_scoring_hit_treated_as_no_match(self):
        provider = MagicMock()
        provider.search.return_value = [_track("Completely Unrelated Song", ["Someone Else"])]

        with patch(
            "tidal_dl_ru.core.set_track_match.get_provider_by_name",
            return_value=provider,
        ):
            result = await match_tidal_track("AN21 & Pretty Output", "Run")

        assert result is None

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
