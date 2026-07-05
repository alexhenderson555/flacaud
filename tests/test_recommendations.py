from unittest.mock import AsyncMock, MagicMock

import pytest

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.providers.tidal.models import Artist as TidalArtist
from tidal_dl_ru.providers.tidal.models import Track as TidalTrack
from tidal_dl_ru.server.recommendations import (
    _append_unique,
    _artist_name_ok,
    _fetch_genre_seed_tracks,
    _finalize_track_covers,
    _get_seeds_for_genre,
    _track_ok,
    _tracks_needing_cover_enrich,
    build_recommendations,
    build_track_radio,
    build_track_radio_fast,
)


def _tidal_track(tid: int, title: str, artist_id: int = 100) -> TidalTrack:
    return TidalTrack.model_validate(
        {
            "id": tid,
            "title": title,
            "duration": 180,
            "trackNumber": 1,
            "volumeNumber": 1,
            "explicit": False,
            "artists": [{"id": artist_id, "name": f"Artist {artist_id}"}],
            "album": {
                "id": 1,
                "title": "Album",
                "cover": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                "releaseDate": "2020-01-01",
            },
        }
    )


def test_track_ok_allows_missing_cover():
    bare = Track(
        provider="tidal",
        provider_id="9",
        title="No Cover Yet",
        artists=["X"],
        duration_s=200,
    )
    assert _track_ok(bare)


def test_artist_name_ok_filters_content_farm():
    assert _artist_name_ok("Daft Punk")
    assert _artist_name_ok("Orbital")
    assert not _artist_name_ok("Royalty Free Dance Music DJs")
    assert not _artist_name_ok("Deep Sleep")
    assert not _artist_name_ok("Study Fruits Music")
    assert not _artist_name_ok("Lofi Hip Hop Nation")
    assert not _artist_name_ok("Heavy Metal Guitar Heroes")
    assert not _artist_name_ok("Various Artists")
    assert not _artist_name_ok(None)
    assert not _artist_name_ok("")


def test_get_seeds_for_genre_filters_junk_artists(monkeypatch):
    import tidal_dl_ru.server.recommendations as rec

    monkeypatch.setattr(
        rec, "_get_genres_db",
        lambda: {"Electronic": {"subgenres": [
            {"name": "Techno", "artists": ["Orbital", "Royalty Free Dance Music DJs", "qonran", "Deep Sleep"]},
        ]}},
    )
    seeds = _get_seeds_for_genre("Techno")
    assert "Orbital" in seeds
    assert "Royalty Free Dance Music DJs" not in seeds
    assert "Deep Sleep" not in seeds


@pytest.mark.asyncio
async def test_fetch_genre_seed_tracks_resolves_artists_and_top_tracks():
    # search_artists returns real artist entities; top tracks come from that ID.
    artists = [TidalArtist.model_validate({"id": 55, "name": "Orbital"})]

    class FakeClient:
        def search_artists(self, name, limit=10, offset=0):
            assert name == "Orbital"
            return artists

        def get_artist_top_tracks(self, artist_id):
            assert int(artist_id) == 55
            return [_tidal_track(700, "Halcyon", artist_id=55)]

    out = await _fetch_genre_seed_tracks(FakeClient(), ["Orbital"], set())
    assert len(out) == 1
    assert out[0].provider_id == "700"


@pytest.mark.asyncio
async def test_fetch_genre_seed_tracks_skips_seen():
    class FakeClient:
        def search_artists(self, name, limit=10, offset=0):
            return [TidalArtist.model_validate({"id": 1, "name": name})]

        def get_artist_top_tracks(self, artist_id):
            return [_tidal_track(800, "Already Played", artist_id=1)]

    out = await _fetch_genre_seed_tracks(FakeClient(), ["X"], seen={"800"})
    assert out == []


def test_track_ok_rejects_daily_mix_titles():
    ok = Track(
        provider="tidal",
        provider_id="1",
        title="Lean On",
        artists=["Major Lazer"],
        cover_url="https://example.com/c.jpg",
        duration_s=200,
    )
    junk = ok.model_copy(update={"title": "Your Daily Mix 42"})
    assert _track_ok(ok)
    assert not _track_ok(junk)


def test_append_unique_skips_same_artist_cap():
    tracks: list[Track] = []
    seen: set[str] = set()
    counts: dict[str, int] = {}
    items = [_tidal_track(i, f"T{i}", artist_id=42) for i in range(1, 8)]
    _append_unique(tracks, seen, counts, items, limit=20)
    assert len(tracks) == 3


def test_tracks_needing_cover_enrich_flags_duplicate_stub_across_albums():
    shared = "https://resources.tidal.com/stub/640"
    a = Track(
        provider="tidal",
        provider_id="1",
        title="A",
        artists=["One"],
        artist_ids=["10"],
        album_id="100",
        cover_url=shared,
        duration_s=200,
    )
    b = Track(
        provider="tidal",
        provider_id="2",
        title="B",
        artists=["Two"],
        artist_ids=["20"],
        album_id="200",
        cover_url=shared,
        duration_s=200,
    )
    assert set(_tracks_needing_cover_enrich([a, b])) == {"1", "2"}


def test_tracks_needing_cover_enrich_allows_same_album_art():
    shared = "https://resources.tidal.com/album/640"
    tracks = [
        Track(
            provider="tidal",
            provider_id=str(i),
            title=f"T{i}",
            artists=["Band"],
            artist_ids=["5"],
            album_id="99",
            cover_url=shared,
            duration_s=200,
        )
        for i in range(1, 4)
    ]
    assert _tracks_needing_cover_enrich(tracks) == []


@pytest.mark.asyncio
async def test_finalize_track_covers_refetches_duplicates(monkeypatch):
    shared = "https://resources.tidal.com/stub/640"

    class FakeClient:
        def get_track(self, track_id):
            tid = int(track_id)
            tr = _tidal_track(tid, f"Full {tid}", artist_id=tid * 10)
            tr.album.cover = f"{tid:08x}-aaaa-bbbb-cccc-dddddddddddd"
            return tr

    stub_a = Track(
        provider="tidal",
        provider_id="1",
        title="A",
        artists=["One"],
        artist_ids=["10"],
        album_id="100",
        cover_url=shared,
        duration_s=200,
    )
    stub_b = stub_a.model_copy(update={"provider_id": "2", "title": "B", "artist_ids": ["20"], "album_id": "200"})

    out = await _finalize_track_covers(FakeClient(), [stub_a, stub_b])
    covers = {t.cover_url for t in out}
    assert len(covers) == 2
    assert all("resources.tidal.com" in (c or "") for c in covers)


@pytest.mark.asyncio
async def test_build_recommendations_uses_track_radio(monkeypatch):
    p = MagicMock()
    monkeypatch.setattr(
        "tidal_dl_ru.server.recommendations.get_provider_by_name",
        lambda _name: p,
    )

    seed = Track(
        provider="tidal",
        provider_id="999",
        title="Seed",
        artists=["A"],
        artist_ids=["1"],
        source_url="https://tidal.com/track/999",
        cover_url="https://example.com/c.jpg",
        duration_s=200,
    )
    p.search.return_value = [seed]

    radio_track = _tidal_track(2, "Radio Hit", artist_id=77)

    class FakeClient:
        def get_track_radio(self, track_id, limit=25):
            assert str(track_id) == "999"
            return [radio_track]

        def get_similar_tracks(self, track_id, limit=25):
            return []

        def get_track_mix_tracks(self, track_id, limit=25):
            return []

        def get_artist_radio(self, artist_id, limit=25):
            return []

        def close(self):
            pass

    async def fake_with_client():
        return FakeClient(), MagicMock()

    monkeypatch.setattr(
        "tidal_dl_ru.server.recommendations._with_client",
        fake_with_client,
    )

    out = await build_recommendations(5, None, None)
    assert len(out) >= 1
    assert out[0].title == "Radio Hit"
    assert str(out[0].artist_ids[0]) == "77"


@pytest.mark.asyncio
async def test_build_recommendations_honors_exclude_ids(monkeypatch):
    p = MagicMock()
    monkeypatch.setattr(
        "tidal_dl_ru.server.recommendations.get_provider_by_name",
        lambda _name: p,
    )

    seed = Track(
        provider="tidal",
        provider_id="999",
        title="Seed",
        artists=["A"],
        artist_ids=["1"],
        source_url="https://tidal.com/track/999",
        cover_url="https://example.com/c.jpg",
        duration_s=200,
    )
    p.search.return_value = [seed]

    radio_hit = _tidal_track(2, "Radio Hit", artist_id=77)
    alt_hit = _tidal_track(3, "Alt Hit", artist_id=88)

    class FakeClient:
        def get_track_radio(self, track_id, limit=25):
            return [radio_hit, alt_hit]

        def get_similar_tracks(self, track_id, limit=25):
            return []

        def get_track_mix_tracks(self, track_id, limit=25):
            return []

        def get_artist_radio(self, artist_id, limit=25):
            return []

        def close(self):
            pass

    async def fake_with_client():
        return FakeClient(), MagicMock()

    monkeypatch.setattr(
        "tidal_dl_ru.server.recommendations._with_client",
        fake_with_client,
    )

    out = await build_recommendations(5, None, None, exclude_ids={"2"})
    assert all(str(t.provider_id) != "2" for t in out)
    assert any(str(t.provider_id) == "3" for t in out)


@pytest.mark.asyncio
async def test_build_track_radio_keeps_same_artist_and_stub_cover(monkeypatch):
    monkeypatch.setattr(
        "tidal_dl_ru.server.recommendations.get_provider_by_name",
        lambda _name: MagicMock(search=lambda *_a, **_k: []),
    )

    seed = _tidal_track(100, "Replace You", artist_id=55)
    same_artist = _tidal_track(101, "Same Artist Hit", artist_id=55)
    # Stub album without cover — must not be dropped
    same_artist.album.cover = None

    class FakeClient:
        def get_track(self, track_id):
            assert str(track_id) == "100"
            return seed

        def get_track_radio(self, track_id, limit=40):
            return [same_artist]

        def get_similar_tracks(self, track_id, limit=40):
            return []

        def get_track_mix_tracks(self, track_id, limit=40):
            return []

        def get_artist_radio(self, artist_id, limit=25):
            return []

    async def fake_with_client():
        return FakeClient(), MagicMock()

    monkeypatch.setattr(
        "tidal_dl_ru.server.recommendations._with_client",
        fake_with_client,
    )

    out = await build_track_radio("100", limit=10)
    assert len(out) >= 2
    assert out[0].provider_id == "100"
    assert any(t.provider_id == "101" for t in out)


@pytest.mark.asyncio
async def test_build_track_radio_fast_skips_graph_expansion(monkeypatch):
    monkeypatch.setattr(
        "tidal_dl_ru.server.recommendations.get_provider_by_name",
        lambda _name: MagicMock(search=lambda *_a, **_k: []),
    )

    seed = _tidal_track(100, "Fast Seed", artist_id=55)
    hit = _tidal_track(101, "Fast Hit", artist_id=77)
    graph_calls: list[str] = []

    class FakeClient:
        def get_track(self, track_id):
            assert str(track_id) == "100"
            return seed

        def get_track_radio(self, track_id, limit=40):
            return [hit]

        def get_similar_tracks(self, track_id, limit=40):
            graph_calls.append(str(track_id))
            return []

        def get_track_mix_tracks(self, track_id, limit=40):
            return []

    async def fake_with_client():
        return FakeClient(), MagicMock()

    monkeypatch.setattr(
        "tidal_dl_ru.server.recommendations._with_client",
        fake_with_client,
    )
    monkeypatch.setattr(
        "tidal_dl_ru.server.recommendations._expand_similar_graph",
        AsyncMock(side_effect=AssertionError("fast mode must not expand graph")),
    )

    out = await build_track_radio_fast("100", limit=10)
    assert out[0].provider_id == "100"
    assert any(t.provider_id == "101" for t in out)
    assert graph_calls == ["100"]
