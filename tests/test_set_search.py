from tidal_dl_ru.core.set_search import (
    MIN_SET_DURATION_SECONDS,
    _entry_to_result,
    build_similar_queries,
    search_sets,
)


class TestEntryToResult:
    def test_soundcloud_prefers_webpage_url_over_api_url(self):
        # entry["url"] for SoundCloud's flat search results is the internal
        # API resource form -- not downloadable, 401s/429s every time. The
        # real public page lives in webpage_url and must win.
        entry = {
            "id": "2361184544",
            "url": "https://api.soundcloud.com/tracks/soundcloud%3Atracks%3A2361184544",
            "webpage_url": "https://soundcloud.com/kayo/moeaike-live-performance",
            "title": "Moeaike Live Performance",
            "duration": 3600,
        }
        row = _entry_to_result(entry, "soundcloud")
        assert row["url"] == "https://soundcloud.com/kayo/moeaike-live-performance"

    def test_youtube_keeps_working_url_with_no_webpage_url(self):
        # YouTube's flat entries have webpage_url=None and an already-correct url.
        entry = {
            "id": "abc123",
            "url": "https://www.youtube.com/watch?v=abc123",
            "webpage_url": None,
            "title": "Some DJ Set",
            "duration": 3600,
        }
        row = _entry_to_result(entry, "youtube")
        assert row["url"] == "https://www.youtube.com/watch?v=abc123"

    def test_youtube_reconstructs_url_when_url_is_a_bare_id(self):
        # Some yt-dlp modes/versions put a bare (non-http) value in url.
        entry = {"id": "abc123", "url": "abc123", "title": "Some DJ Set", "duration": 3600}
        row = _entry_to_result(entry, "youtube")
        assert row["url"] == "https://www.youtube.com/watch?v=abc123"

    def test_returns_none_without_any_url(self):
        entry = {"title": "No URL Here", "duration": 3600}
        assert _entry_to_result(entry, "soundcloud") is None


def test_similar_queries_prefer_artist_over_festival_channel():
    # The festival's own upload channel ("Tomorrowland") is not who's playing —
    # the artist name in the title should drive the "similar" search, not the channel.
    qs = build_similar_queries("Antdot | Tomorrowland Winter 2026", "Tomorrowland")
    assert qs[0] == "Antdot dj set"
    # Blended like radio: also includes the event/channel as a second angle.
    assert "Tomorrowland dj set" in qs


def test_similar_queries_include_genre_when_present():
    qs = build_similar_queries("Antdot - Afro House Mix 2025", "Antdot")
    assert "afro house dj set" in qs


def test_similar_queries_dedupe_artist_and_channel():
    qs = build_similar_queries("Antdot @ Club Vibe 2025", "Antdot")
    assert qs.count("Antdot dj set") == 1


def test_similar_queries_falls_back_to_cleaned_title_without_anything_else():
    qs = build_similar_queries("Some Mix 2025 [HD]", "")
    assert len(qs) == 1
    assert "dj set" in qs[0]
    assert "2025" not in qs[0]


def test_search_sets_filters_out_short_tracks(monkeypatch):
    import tidal_dl_ru.core.set_search as mod

    def fake_search_one(query, prefix, source, limit):
        return [
            {"url": "https://x/1", "title": "Short track", "channel": "A",
             "duration_seconds": 180, "thumbnail": None, "source": source,
             "view_count": 0, "upload_timestamp": None},
            {"url": "https://x/2", "title": "Full DJ set", "channel": "B",
             "duration_seconds": MIN_SET_DURATION_SECONDS + 60, "thumbnail": None,
             "source": source, "view_count": 0, "upload_timestamp": None},
        ]

    monkeypatch.setattr(mod, "_search_one", fake_search_one)
    results = search_sets("test query")
    assert len(results) == 2  # 2 sources x 1 surviving long result each
    assert all(r["duration_seconds"] >= MIN_SET_DURATION_SECONDS for r in results)


def test_search_sets_ranks_by_relevance_not_source_order(monkeypatch):
    """A SoundCloud result ranked #1 on its own platform must not lose to a
    YouTube result ranked #1 there just because YouTube was queried first —
    concatenating [all YouTube] + [all SoundCloud] was the actual bug."""
    import tidal_dl_ru.core.set_search as mod

    def fake_search_one(query, prefix, source, limit):
        long_row = {
            "url": f"https://{source}/best", "title": "Best match", "channel": "X",
            "duration_seconds": MIN_SET_DURATION_SECONDS + 60, "thumbnail": None,
            "source": source, "view_count": 0, "upload_timestamp": None,
        }
        return [long_row]

    monkeypatch.setattr(mod, "_search_one", fake_search_one)
    results = search_sets("test query", limit=2)
    # Both top-ranked (rank 0) on their own platform with identical inputs —
    # scores must tie, not have SoundCloud structurally lose to YouTube.
    assert {r["source"] for r in results} == {"youtube", "soundcloud"}
