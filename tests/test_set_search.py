from tidal_dl_ru.core.set_search import MIN_SET_DURATION_SECONDS, build_similar_query, search_sets


def test_similar_query_prefers_artist_from_title_over_festival_channel():
    # The festival's own upload channel ("Tomorrowland") is not who's playing —
    # the artist name in the title is what should drive the "similar" search.
    q = build_similar_query("Antdot | Tomorrowland Winter 2026", "Tomorrowland")
    assert q == "Antdot dj set"


def test_similar_query_handles_at_separator():
    q = build_similar_query("Antdot @ Club Vibe 2025", "Antdot")
    assert q == "Antdot dj set"


def test_similar_query_falls_back_to_channel_without_separator():
    q = build_similar_query("SUMMER GOOD VIBES HOUSE VOL 1", "HORUS")
    assert q == "HORUS dj set"


def test_similar_query_falls_back_to_cleaned_title_without_channel():
    q = build_similar_query("Some Mix 2025 [HD]", "")
    assert "dj set" in q
    assert "2025" not in q


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
