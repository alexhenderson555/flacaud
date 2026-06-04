"""End-to-end pipeline test on a fake Redis.

Exercises the *real* path, with no live Redis, no network and no real provider:

    POST /api/jobs  ->  arq enqueue  ->  arq Worker runs download_url
    ->  JobStatus transitions in Redis  ->  the bot polls + delivers the file

What's real here (vs. the route-level TestClient tests in test_api_integration):
  * Redis — both the sync ``job_state`` client *and* the async arq pool/worker —
    is backed by a single shared fakeredis ``FakeServer``, so the worker's async
    writes are read back through the sync state layer exactly as in production.
  * The arq queue + Worker loop (enqueue, pickle, poll, execute, mark done).
  * ``download_url``'s orchestration: expand -> per-track download -> state.
  * Real file-token signing and the real ``GET /api/files/{token}`` delivery.
  * The bot's own ``APIClient`` coroutines (create_job/wait_for_job/download_file)
    driven over an in-process ASGI transport — not a reimplementation.

What's stubbed (deliberately — it's not what this test covers):
  * The provider: a stub that expands to N tracks and writes a small blob.
  * Network/audio side effects (lyrics fetch is skipped via lyrics=False; mutagen
    tagging is neutralised — it would choke on the fake file).
  * Auth on /api/jobs (overridden to a fixed user; auth itself is covered by
    test_api_integration.py). This keeps the focus on queue/worker/state/delivery.
"""

from __future__ import annotations

from pathlib import Path

import arq.worker as arq_worker_mod
import httpx
import pytest
from arq.connections import ArqRedis
from arq.worker import Worker
from fakeredis import FakeServer, FakeStrictRedis
from fakeredis.aioredis import FakeAsyncRedisConnection
from redis.asyncio import ConnectionPool

from tidal_dl_ru.core.models import Track
from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.models import User
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server import worker as worker_mod
from tidal_dl_ru.server.app import app
from tidal_dl_ru.server.settings import settings

TEST_URL = "https://stub.test/album/1"
TEST_USER_ID = 7
BLOB = b"FAKEFLAC" * 16


class _StubProvider:
    """Minimal Provider stand-in: expands to N tracks, 'downloads' a byte blob."""

    name = "stub"

    def __init__(self, n_tracks: int = 1) -> None:
        self._n = n_tracks

    def supports(self, url: str) -> bool:
        return True

    def expand(self, url: str) -> list[Track]:
        return [
            Track(
                provider="stub",
                provider_id=f"t{i}",
                title=f"Song {i}",
                artists=["Stub Artist"],
                album="Stub Album",
                track_number=i + 1,
                source_url=url,
            )
            for i in range(self._n)
        ]

    def download(self, track, base: Path, quality, on_progress=None) -> Path:
        base.parent.mkdir(parents=True, exist_ok=True)
        path = base.with_suffix(".flac")
        if on_progress:
            on_progress(len(BLOB), len(BLOB))
        path.write_bytes(BLOB)
        return path


def _install_provider(monkeypatch, stub: _StubProvider) -> None:
    """Point both the route's and the worker's find_provider at the stub."""
    monkeypatch.setattr("tidal_dl_ru.server.routers.jobs.find_provider", lambda url: stub)
    monkeypatch.setattr(worker_mod, "find_provider", lambda url: stub)


@pytest.fixture
def wired(tmp_path, monkeypatch):
    """Wire the whole stack onto one in-memory fakeredis server.

    Yields (server, arq_pool). lifespan is intentionally NOT run (we use the app
    via ASGITransport, not TestClient's context manager), so app.state.arq stays
    the fake pool we set here instead of being overwritten by a real-Redis probe.
    """
    server = FakeServer()

    # job_state (sync redis) -> shared fakeredis
    def _fake_client():
        r = FakeStrictRedis(server=server, decode_responses=True)
        r.ping()
        return r

    monkeypatch.setattr(job_state, "_client", _fake_client)

    # arq logs INFO at worker startup; fakeredis has no INFO -> no-op it.
    async def _noop_info(redis, log_func):
        return None

    monkeypatch.setattr(arq_worker_mod, "log_redis_info", _noop_info)

    # Hermetic file output: job dir + downloaded-registry under tmp_path.
    monkeypatch.setattr(settings, "jobs_dir", tmp_path)
    monkeypatch.setattr(job_state, "_registry_path", tmp_path / "downloaded_tracks.json")

    # Neutralise tagging (mutagen would reject the fake file; not under test).
    monkeypatch.setattr(worker_mod, "tag_file", lambda *a, **k: None)

    # DB-free quota check + fixed authenticated user.
    monkeypatch.setattr("tidal_dl_ru.bot.users.reserve_web_download", lambda uid: (True, None))
    app.dependency_overrides[get_current_user] = lambda: User(id=TEST_USER_ID, username="bot-user")

    # Default provider (one track); failure-path test overrides this.
    _install_provider(monkeypatch, _StubProvider(n_tracks=1))

    # Async arq pool on the same fakeredis -> what the API route enqueues onto.
    arq = ArqRedis(
        connection_pool=ConnectionPool(connection_class=FakeAsyncRedisConnection, server=server)
    )
    monkeypatch.setattr(app.state, "arq", arq, raising=False)

    yield server, arq

    app.dependency_overrides.clear()


def _bot_client() -> "tuple":
    """A bot APIClient whose HTTP layer talks to the app in-process."""
    from tidal_dl_ru.bot.api_client import APIClient

    api = APIClient()
    return api


async def _drain_worker(arq: ArqRedis) -> None:
    worker = Worker(
        functions=[worker_mod.download_url, worker_mod.analyze_set],
        redis_pool=arq,
        burst=True,
        poll_delay=0.0,
        max_jobs=10,
        handle_signals=False,
    )
    await worker.async_run()


async def test_full_pipeline_to_bot_delivery(wired):
    """Happy path: a queued download job runs through the worker to a file the
    bot can fetch — queued -> done, with a valid signed token end-to-end."""
    server, arq = wired
    api = _bot_client()
    await api._http.aclose()
    api._http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://bot-test")
    api._base = "http://bot-test"

    try:
        # 1. Bot creates the job -> real POST /api/jobs (auth dep, quota, enqueue).
        created = await api.create_job(TEST_URL, lyrics=False)
        job_id = created.job_id
        assert created.status == "queued"
        assert created.owner_id == TEST_USER_ID

        # It's really sitting on the arq queue in (fake) Redis.
        sync = FakeStrictRedis(server=server, decode_responses=True)
        assert sync.exists(f"arq:job:{job_id}")

        # 2. The real arq Worker drains the queue.
        await _drain_worker(arq)

        # 3. JobStatus transitioned queued -> done in (fake) Redis.
        final = job_state.load(job_id)
        assert final is not None
        assert final.status == "done"
        assert final.total_tracks == 1
        assert final.done_tracks == 1
        assert final.tracks[0].status == "done"
        assert final.tracks[0].file_token

        # 4. The bot polls, sees "done", and downloads the delivered bytes.
        status = await api.wait_for_job(job_id, poll_interval=0.0, timeout=5)
        assert status.status == "done"
        deliverable = [t for t in status.tracks if t.status == "done" and t.file_token]
        assert deliverable, "bot found no deliverable track"
        content, filename = await api.download_file(deliverable[0].file_token)
        assert content == BLOB
        assert filename.endswith(".flac")
    finally:
        await api.close()
        await arq.aclose()


async def test_pipeline_marks_job_failed_when_url_resolves_to_nothing(wired, monkeypatch):
    """Failure path: a provider that resolves no tracks drives the job to
    'failed' (via mark_failed, not mark_done), and the bot's poll sees it."""
    server, arq = wired
    _install_provider(monkeypatch, _StubProvider(n_tracks=0))

    api = _bot_client()
    await api._http.aclose()
    api._http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://bot-test")
    api._base = "http://bot-test"

    try:
        created = await api.create_job(TEST_URL, lyrics=False)
        job_id = created.job_id
        assert created.status == "queued"

        await _drain_worker(arq)

        final = job_state.load(job_id)
        assert final is not None
        assert final.status == "failed"
        assert final.done_tracks == 0

        status = await api.wait_for_job(job_id, poll_interval=0.0, timeout=5)
        assert status.status == "failed"
    finally:
        await api.close()
        await arq.aclose()


# ── Real-auth tests ──────────────────────────────────────────────────────────
# Unlike the pipeline tests above, these do NOT override get_current_user: the
# bot's uid+src=bot token must authenticate against the real route, and the
# route must skip its own web-quota reservation for bot-originated jobs (so the
# shared daily limit isn't double-charged on top of the bot's check_and_increment).


@pytest.fixture
def live_auth(tmp_path, monkeypatch):
    """Real DB + real auth, fakeredis-backed queue, stub provider. No overrides.

    auth.py binds ``engine`` at import, so both it and database.engine must be
    pointed at the temp DB for the route's user lookup to see our test user.
    """
    from sqlmodel import SQLModel, create_engine

    import tidal_dl_ru.database.auth as auth_mod
    import tidal_dl_ru.database.database as db_mod
    import tidal_dl_ru.database.models  # noqa: F401 — register tables

    engine = create_engine(
        f"sqlite:///{(tmp_path / 'auth.db').as_posix()}",
        connect_args={"check_same_thread": False},
    )
    monkeypatch.setattr(db_mod, "engine", engine)
    monkeypatch.setattr(auth_mod, "engine", engine)
    SQLModel.metadata.create_all(engine)

    server = FakeServer()

    def _fake_client():
        r = FakeStrictRedis(server=server, decode_responses=True)
        r.ping()
        return r

    monkeypatch.setattr(job_state, "_client", _fake_client)
    monkeypatch.setattr(settings, "jobs_dir", tmp_path)
    _install_provider(monkeypatch, _StubProvider(n_tracks=1))

    arq = ArqRedis(
        connection_pool=ConnectionPool(connection_class=FakeAsyncRedisConnection, server=server)
    )
    monkeypatch.setattr(app.state, "arq", arq, raising=False)

    yield arq


def _asgi_bot_client():
    api = _bot_client()
    return api


async def test_bot_uid_token_authenticates_and_skips_route_metering(live_auth):
    """The bot's uid+src=bot token authenticates the real route, and the route
    does NOT charge web quota for it (the bot meters itself)."""
    arq = live_auth
    from tidal_dl_ru.bot.users import get_or_create

    user = get_or_create(telegram_id=555, username="tg_user")
    uid = user.id
    assert user.downloads_today == 0

    api = _bot_client()
    await api._http.aclose()
    api._http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://bot-test")
    api._base = "http://bot-test"
    try:
        created = await api.create_job(TEST_URL, lyrics=False, user_id=uid)
        assert created.status == "queued"
        assert created.owner_id == uid  # uid claim resolved to the right user
    finally:
        await api.close()
        await arq.aclose()

    # src=bot => reserve_web_download skipped => counter untouched by the route.
    assert get_or_create(telegram_id=555).downloads_today == 0


async def test_web_token_still_meters_quota(live_auth):
    """Control: a normal (sub=username, no src=bot) token still reserves one
    download via the route — proving the skip is bot-specific, not global."""
    arq = live_auth
    from tidal_dl_ru.bot.users import get_or_create
    from tidal_dl_ru.database.auth import create_access_token

    get_or_create(telegram_id=556, username="web_user")
    web_token = create_access_token({"sub": "web_user"})

    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://web-test"
        ) as client:
            r = await client.post(
                "/api/jobs",
                json={"url": TEST_URL, "quality": "LOSSLESS", "lyrics": False},
                headers={"Authorization": f"Bearer {web_token}"},
            )
            assert r.status_code == 200, r.text
    finally:
        await arq.aclose()

    assert get_or_create(telegram_id=556).downloads_today == 1
