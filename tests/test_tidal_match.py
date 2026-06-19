"""Unit tests for Tidal catalog matching helpers."""

from unittest.mock import MagicMock, patch

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.providers.tidal_match import (
    match_track_to_tidal,
    match_tracks_to_tidal,
)


def _source_track(**kwargs) -> Track:
    return Track(
        provider="spotify",
        provider_id="1",
        title=kwargs.get("title", "Song"),
        artists=kwargs.get("artists", ["Artist"]),
        album=kwargs.get("album"),
        duration_s=kwargs.get("duration_s"),
        isrc=kwargs.get("isrc"),
    )


class TestTidalMatch:
    @patch("tidal_dl_ru.providers.tidal_match._tidal_provider")
    def test_isrc_dedup_uses_single_lookup(self, mock_provider_fn):
        tidal = MagicMock()
        tidal.search.return_value = []
        client = tidal._client.return_value.__enter__.return_value
        client.search_by_isrc.return_value = Track(
            provider="tidal",
            provider_id="99",
            title="Song",
            artists=["Artist"],
            duration_s=200,
            isrc="USRC1",
        )
        mock_provider_fn.return_value = tidal

        sources = [
            _source_track(isrc="USRC1", duration_s=200),
            _source_track(isrc="USRC1", duration_s=200),
            _source_track(isrc="USRC2", duration_s=180),
        ]
        client.search_by_isrc.side_effect = lambda isrc: Track(
            provider="tidal",
            provider_id="99" if isrc == "USRC1" else "100",
            title="Song",
            artists=["Artist"],
            duration_s=200 if isrc == "USRC1" else 180,
            isrc=isrc,
        )
        matched, unmatched, _details = match_tracks_to_tidal(sources)
        assert len(matched) == 3
        assert unmatched == 0
        assert client.search_by_isrc.call_count == 2

    @patch("tidal_dl_ru.providers.tidal_match._tidal_provider")
    def test_match_by_search(self, mock_provider_fn):
        tidal = MagicMock()
        tidal.search.return_value = [
            Track(provider="tidal", provider_id="99", title="Song", artists=["Artist"], duration_s=200),
        ]
        mock_provider_fn.return_value = tidal

        hit, _detail = match_track_to_tidal(_source_track(duration_s=201))
        assert hit is not None
        assert hit.provider_id == "99"

    @patch("tidal_dl_ru.providers.tidal_match._tidal_provider")
    def test_rejects_wrong_artist_for_generic_title(self, mock_provider_fn):
        tidal = MagicMock()
        tidal.search.return_value = [
            Track(
                provider="tidal",
                provider_id="wrong",
                title="Vibes",
                artists=["Mack Wilds", "Cam Wallace"],
                duration_s=192,
            ),
            Track(
                provider="tidal",
                provider_id="right",
                title="VIBES",
                artists=["BRY", "Stibens"],
                duration_s=197,
            ),
        ]
        mock_provider_fn.return_value = tidal

        hit, _detail = match_track_to_tidal(
            _source_track(title="VIBES", artists=["BRY", "Stibens"], duration_s=197),
        )
        assert hit is not None
        assert hit.provider_id == "right"

    @patch("tidal_dl_ru.providers.tidal_match._tidal_provider")
    def test_generic_title_unmatched_when_only_wrong_artists(self, mock_provider_fn):
        tidal = MagicMock()
        tidal.search.return_value = [
            Track(
                provider="tidal",
                provider_id="wrong",
                title="Vibes",
                artists=["Mack Wilds", "Cam Wallace"],
                duration_s=192,
            ),
        ]
        mock_provider_fn.return_value = tidal

        hit, _detail = match_track_to_tidal(
            _source_track(title="VIBES", artists=["BRY", "Stibens"], duration_s=197),
        )
        assert hit is None

    @patch("tidal_dl_ru.providers.tidal_match._tidal_provider")
    def test_rejects_remix_when_source_is_studio(self, mock_provider_fn):
        tidal = MagicMock()
        tidal.search.return_value = [
            Track(
                provider="tidal",
                provider_id="remix",
                title="Say What (Remix)",
                artists=["Rampa"],
                duration_s=302,
            ),
            Track(
                provider="tidal",
                provider_id="studio",
                title="Say What",
                artists=["Rampa", "Adam Port"],
                duration_s=182,
            ),
        ]
        mock_provider_fn.return_value = tidal

        hit, _detail = match_track_to_tidal(
            _source_track(
                title="Say What",
                artists=["Rampa", "Adam Port"],
                duration_s=182,
            ),
        )
        assert hit is not None
        assert hit.provider_id == "studio"

    @patch("tidal_dl_ru.providers.tidal_match._tidal_provider")
    def test_say_what_skips_friends_remake_when_source_is_studio(self, mock_provider_fn):
        tidal = MagicMock()
        tidal.search.return_value = [
            Track(
                provider="tidal",
                provider_id="friends-remake",
                title="It's Not Right (&friends Remake)",
                artists=["Gianni Romano", "Emanuele Esposito", "&Friends", "Helen Tesfazghi"],
                duration_s=242,
            ),
        ]
        mock_provider_fn.return_value = tidal

        hit, detail = match_track_to_tidal(
            _source_track(
                title="Say What",
                artists=["Rampa", "Adam Port", "&ME", "Chuala", "Keinemusik"],
                duration_s=182,
            ),
        )
        assert hit is None
        assert detail.method == "search"
        assert (detail.score or 0) < 0.55

    @patch("tidal_dl_ru.providers.tidal_match._tidal_provider")
    def test_say_what_full_artist_query_can_recover_exact_track(self, mock_provider_fn):
        tidal = MagicMock()

        def search_side_effect(query, limit=12):
            q = query.lower()
            if "rampa adam port" in q and "say what" in q:
                return [
                    Track(
                        provider="tidal",
                        provider_id="say-what-exact",
                        title="Say What",
                        artists=["Rampa", "Adam Port", "&ME", "Chuala", "Keinemusik"],
                        duration_s=182,
                    )
                ]
            return [
                Track(
                    provider="tidal",
                    provider_id="friends-remake",
                    title="It's Not Right (&friends Remake)",
                    artists=["Gianni Romano", "Emanuele Esposito", "&Friends", "Helen Tesfazghi"],
                    duration_s=242,
                )
            ]

        tidal.search.side_effect = search_side_effect
        mock_provider_fn.return_value = tidal

        hit, detail = match_track_to_tidal(
            _source_track(
                title="Say What",
                artists=["Rampa", "Adam Port", "&ME", "Chuala", "Keinemusik"],
                duration_s=182,
            ),
        )
        assert hit is not None
        assert hit.provider_id == "say-what-exact"
        assert detail.method == "search"
        assert (detail.score or 0) >= 0.55

    @patch("tidal_dl_ru.providers.tidal_match._tidal_provider")
    def test_isrc_rejected_when_result_isrc_mismatch(self, mock_provider_fn):
        tidal = MagicMock()
        tidal.search.return_value = []
        client = tidal._client.return_value.__enter__.return_value
        client.search_by_isrc.return_value = Track(
            provider="tidal",
            provider_id="99",
            title="Other",
            artists=["X"],
            isrc="WRONG",
            duration_s=200,
        )
        mock_provider_fn.return_value = tidal

        hit, _detail = match_track_to_tidal(_source_track(isrc="USRC1", duration_s=200))
        assert hit is None

    @patch("tidal_dl_ru.providers.tidal_match._tidal_provider")
    def test_match_tracks_counts_unmatched(self, mock_provider_fn):
        tidal = MagicMock()
        tidal.search.return_value = []
        tidal._client.return_value.__enter__.return_value.search_by_isrc.return_value = None
        mock_provider_fn.return_value = tidal

        matched, unmatched, _details = match_tracks_to_tidal([_source_track(), _source_track(title="Other")])
        assert matched == []
        assert unmatched == 2
