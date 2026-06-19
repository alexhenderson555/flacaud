"""Tests for server.schemas — API request/response validation."""

from tidal_dl_ru.core.models import Quality
from tidal_dl_ru.server.schemas import (
    AnalysisProgress,
    JobCreate,
    JobStatus,
    PoolHealth,
    ProviderInfo,
    SearchRequest,
    SearchResponse,
    TrackProgress,
)


class TestJobCreate:
    def test_defaults(self):
        j = JobCreate(url="https://tidal.com/browse/track/123")
        assert j.quality == Quality.LOSSLESS
        assert j.lyrics is False
        assert j.karaoke is False
        assert j.dj_analyze is False

    def test_custom_values(self):
        j = JobCreate(
            url="https://tidal.com/browse/track/123",
            quality=Quality.HI_RES,
            lyrics=False,
            karaoke=True,
            dj_analyze=True,
        )
        assert j.quality == Quality.HI_RES
        assert j.lyrics is False
        assert j.karaoke is True
        assert j.dj_analyze is True


class TestSearchRequest:
    def test_defaults(self):
        r = SearchRequest(query="test")
        assert r.provider == "tidal"
        assert r.limit == 50

    def test_limit_bounds(self):
        r = SearchRequest(query="test", limit=50)
        assert r.limit == 50


class TestTrackProgress:
    def test_defaults(self):
        tp = TrackProgress(title="Song", status="queued")
        assert tp.bytes_written == 0
        assert tp.bytes_total is None
        assert tp.file_token is None
        assert tp.error is None


class TestAnalysisProgress:
    def test_fields(self):
        ap = AnalysisProgress(
            phase="scan",
            percent=40,
            segments_done=5,
            segments_total=100,
            tracks_found=2,
            label="Analyzing… 40%",
        )
        assert ap.phase == "scan"
        assert ap.percent == 40
        assert ap.segments_total == 100


class TestJobStatus:
    def test_minimal(self):
        js = JobStatus(
            job_id="abc",
            status="queued",
            created_at=1000.0,
            updated_at=1000.0,
        )
        assert js.total_tracks == 0
        assert js.tracks == []
        assert js.provider is None


class TestPoolHealth:
    def test_fields(self):
        ph = PoolHealth(total=10, active=8, banned=1, exhausted=1)
        assert ph.total == 10
        assert ph.active + ph.banned + ph.exhausted == 10


class TestProviderInfo:
    def test_fields(self):
        pi = ProviderInfo(name="tidal", display_name="Tidal")
        assert pi.name == "tidal"


class TestSearchResponse:
    def test_empty(self):
        sr = SearchResponse(tracks=[])
        assert sr.tracks == []
