"""Tests for Transition Finder — Camelot + BPM compatibility scoring + endpoint."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine

from tests.conftest import register_and_login
from tidal_dl_ru.database.models import SavedTrack
from tidal_dl_ru.server.app import app
from tidal_dl_ru.server.transitions import (
    AVOID,
    PERFECT,
    CamelotKey,
    bpm_compatibility,
    camelot_compatibility,
    find_transitions,
    transition_score,
)


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    import tidal_dl_ru.database.database as db_mod
    import tidal_dl_ru.database.models  # noqa: F401

    test_db = tmp_path / "test_transitions.db"
    monkeypatch.setattr(db_mod, "_db_path", test_db)
    monkeypatch.setattr(db_mod, "DATABASE_URL", f"sqlite:///{test_db.as_posix()}")
    engine = create_engine(
        f"sqlite:///{test_db.as_posix()}",
        connect_args={"check_same_thread": False},
    )
    monkeypatch.setattr(db_mod, "engine", engine)
    SQLModel.metadata.create_all(engine)
    yield
    db_mod.engine = None


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _saved(tid, bpm, camelot, title="T", artists=None):
    return SavedTrack(
        id=tid,
        user_id=1,
        provider="tidal",
        provider_id=str(tid),
        title=title,
        artists_json=json.dumps(artists or ["A"]),
        bpm=bpm,
        camelot_key=camelot,
        musical_key=camelot,
        duration=200,
    )


_TRACK = {
    "provider": "tidal",
    "artists_json": '["Artist"]',
    "duration": 200,
    "quality": "LOSSLESS",
}


# ── Camelot compatibility ────────────────────────────────────────────


def test_camelot_same_key_perfect():
    assert camelot_compatibility("8A", "8A") == PERFECT


def test_camelot_adjacent_same_letter_great():
    assert camelot_compatibility("8A", "7A") > 0  # 7A → great
    assert camelot_compatibility("8A", "9A") > 0  # 9A → great


def test_camelot_wrap_adjacent_great():
    """12A and 1A are adjacent on the wheel (wrap)."""
    assert camelot_compatibility("12A", "1A") > 0
    assert camelot_compatibility("1A", "12A") > 0


def test_camelot_relative_major_minor_great():
    """8A and 8B — relative major/minor, shared notes."""
    assert camelot_compatibility("8A", "8B") > 0


def test_camelot_diagonal_good():
    """8A → 7B or 9B: energetic but compatible."""
    score = camelot_compatibility("8A", "9B")
    assert score > 0
    assert score < PERFECT


def test_camelot_far_apart_avoid():
    """8A → 11B: no harmonic relationship."""
    assert camelot_compatibility("8A", "11B") == AVOID


def test_camelot_invalid_keys_avoid():
    assert camelot_compatibility(None, "8A") == AVOID
    assert camelot_compatibility("8A", None) == AVOID
    assert camelot_compatibility("garbage", "8A") == AVOID
    assert camelot_compatibility("13A", "8A") == AVOID  # 13 is out of range


def test_camelot_key_parse():
    assert CamelotKey.parse("8A") == CamelotKey(8, "A")
    assert CamelotKey.parse("12b") == CamelotKey(12, "B")
    assert CamelotKey.parse(None) is None
    assert CamelotKey.parse("") is None
    assert CamelotKey.parse("X") is None


# ── BPM compatibility ────────────────────────────────────────────────


def test_bpm_exact_match_perfect():
    assert bpm_compatibility(124, 124) == PERFECT


def test_bpm_close_great():
    assert bpm_compatibility(124, 128) > 0  # ±4 → great


def test_bpm_far_avoid():
    assert bpm_compatibility(124, 160) == AVOID


def test_bpm_half_time_great():
    """140 BPM mixes with 70 BPM (half-time)."""
    assert bpm_compatibility(140, 70) > 0
    assert bpm_compatibility(140, 70) >= 2  # at least 'good'


def test_bpm_double_time_great():
    """70 BPM mixes with 140 BPM (double-time)."""
    assert bpm_compatibility(70, 140) > 0


def test_bpm_missing_avoid():
    assert bpm_compatibility(None, 124) == AVOID
    assert bpm_compatibility(124, None) == AVOID


# ── Combined transition score ────────────────────────────────────────


def test_transition_score_perfect_key_perfect_bpm():
    score, tier = transition_score(124, "8A", 124, "8A")
    assert score == 100
    assert tier == "perfect"


def test_transition_score_key_clash_zero():
    score, tier = transition_score(124, "8A", 124, "11B")
    assert score == 0
    assert tier == "avoid"


def test_transition_score_bpm_clash_zero():
    score, tier = transition_score(124, "8A", 160, "8A")
    assert score == 0
    assert tier == "avoid"


def test_transition_score_missing_data_zero():
    score, tier = transition_score(None, "8A", 124, "8A")
    assert score == 0


# ── find_transitions ranking ─────────────────────────────────────────


def test_find_transitions_ranks_by_score():
    seed = _saved(1, 124, "8A", title="Seed")
    perfect = _saved(2, 124, "8A", title="Perfect")  # same key, same BPM
    great = _saved(3, 128, "9A", title="Great")  # adjacent key, close BPM
    far = _saved(4, 124, "11B", title="Clash")  # key clash → excluded

    out = find_transitions([seed, perfect, great, far], "1")
    assert len(out) == 2
    assert out[0]["track"]["title"] == "Perfect"
    assert out[0]["score"] == 100
    assert out[1]["track"]["title"] == "Great"
    assert out[1]["score"] < out[0]["score"]


def test_find_transitions_skips_seed_and_unanalyzed():
    seed = _saved(1, 124, "8A")
    unanalyzed = _saved(2, None, None)  # no BPM/key → skipped
    good = _saved(3, 124, "8A")

    out = find_transitions([seed, unanalyzed, good], "1")
    assert len(out) == 1
    assert out[0]["track"]["provider_id"] == "3"


def test_find_transitions_empty_when_seed_missing():
    seed = _saved(1, None, None)
    good = _saved(2, 124, "8A")
    assert find_transitions([seed, good], "1") == []


def test_find_transitions_includes_dj_meta():
    seed = _saved(1, 124, "8A")
    match = _saved(2, 124, "8A")
    out = find_transitions([seed, match], "1")
    assert out[0]["bpm"] == 124
    assert out[0]["camelot_key"] == "8A"
    assert "score" in out[0]
    assert "tier" in out[0]
    assert "bpm_diff" in out[0]


def test_find_transitions_respects_limit():
    seed = _saved(1, 124, "8A")
    matches = [_saved(i, 124, "8A", title=f"T{i}") for i in range(2, 12)]
    out = find_transitions([seed] + matches, "1", limit=5)
    assert len(out) == 5


# ── Endpoint integration ─────────────────────────────────────────────


@pytest.fixture
def auth_headers(client):
    headers, _ = register_and_login(client, username="transuser", email="trans@test.local")
    return headers


def _add_track(client, headers, track_id, title, bpm=None, camelot=None):
    """Add a track via POST /api/library, optionally patch DJ meta."""
    payload = {**_TRACK, "provider_id": str(track_id), "title": title}
    r = client.post("/api/library", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    if bpm and camelot:
        db_id = r.json()["id"]
        patch = client.patch(
            f"/api/library/{db_id}/dj",
            json={"bpm": bpm, "camelot_key": camelot, "musical_key": camelot},
            headers=headers,
        )
        assert patch.status_code == 200, patch.text


def test_endpoint_returns_transitions(client, auth_headers):
    _add_track(client, auth_headers, 1, "Seed", bpm=124, camelot="8A")
    _add_track(client, auth_headers, 2, "Perfect", bpm=124, camelot="8A")
    _add_track(client, auth_headers, 3, "Great", bpm=128, camelot="9A")

    r = client.get("/api/transitions/tidal/1", headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["seed"] == "1"
    assert len(data["tracks"]) == 2
    assert data["tracks"][0]["track"]["title"] == "Perfect"
    assert data["tracks"][0]["score"] == 100


def test_endpoint_rejects_non_tidal(client, auth_headers):
    r = client.get("/api/transitions/spotify/123", headers=auth_headers)
    assert r.status_code == 400


def test_endpoint_requires_auth(client):
    r = client.get("/api/transitions/tidal/1")
    assert r.status_code in (401, 403)


def test_endpoint_empty_when_no_analyzed_tracks(client, auth_headers):
    _add_track(client, auth_headers, 10, "No DJ")  # no bpm/camelot
    r = client.get("/api/transitions/tidal/10", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["tracks"] == []


def test_endpoint_seed_not_in_library(client, auth_headers):
    r = client.get("/api/transitions/tidal/9999", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["tracks"] == []


def test_endpoint_respects_bpm_tolerance(client, auth_headers):
    _add_track(client, auth_headers, 1, "Seed", bpm=124, camelot="8A")
    _add_track(client, auth_headers, 2, "Far BPM", bpm=134, camelot="8A")

    r = client.get("/api/transitions/tidal/1?bpm_tolerance=6", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["tracks"] == []

    r = client.get("/api/transitions/tidal/1?bpm_tolerance=12", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()["tracks"]) == 1
