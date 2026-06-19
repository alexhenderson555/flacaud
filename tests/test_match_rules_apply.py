"""End-to-end: user match rules override tidal matching."""

from unittest.mock import MagicMock

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.providers.match_types import UserMatchRule
from tidal_dl_ru.providers.tidal_match import match_track_to_tidal


def test_rule_override_skips_search(monkeypatch):
    source = Track(
        provider="spotify",
        provider_id="sp1",
        title="Obscure Title",
        artists=["Artist X"],
    )
    forced = Track(
        provider="tidal",
        provider_id="12345",
        title="Forced Match",
        artists=["Artist X"],
    )
    rules = [
        UserMatchRule(
            source_platform="spotify",
            source_title="Obscure Title",
            source_artist="Artist X",
            tidal_provider_id="12345",
        )
    ]

    monkeypatch.setattr(
        "tidal_dl_ru.providers.tidal_match._fetch_tidal_track",
        lambda pid: forced if pid == "12345" else None,
    )
    search_called = {"n": 0}

    def fake_search(*_a, **_k):
        search_called["n"] += 1
        return []

    tidal = MagicMock()
    tidal._client.return_value.__enter__.return_value.search_tracks = fake_search
    monkeypatch.setattr("tidal_dl_ru.providers.tidal_match._tidal_provider", lambda: tidal)

    hit, detail = match_track_to_tidal(source, position=1, user_rules=rules)
    assert hit is not None
    assert hit.provider_id == "12345"
    assert detail.method == "rule_override"
    assert detail.score == 1.0
    assert search_called["n"] == 0


def test_rule_block_prevents_match(monkeypatch):
    source = Track(provider="spotify", provider_id="sp2", title="Blocked", artists=["A"])
    rules = [
        UserMatchRule(
            source_platform="*",
            source_title="Blocked",
            block_match=True,
        )
    ]
    monkeypatch.setattr("tidal_dl_ru.providers.tidal_match._tidal_provider", lambda: MagicMock())
    hit, detail = match_track_to_tidal(source, position=2, user_rules=rules)
    assert hit is None
    assert detail.method == "rule_block"
    assert detail.matched is False
