from tidal_dl_ru.core.set_search import MIN_SET_DURATION_SECONDS, build_similar_queries, search_sets


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
