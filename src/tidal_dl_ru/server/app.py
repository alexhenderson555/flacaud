from __future__ import annotations

"""FastAPI app — REST surface over the CLI core.

Authenticated JSON API (JWT) + short-lived media tokens for streams/downloads.
See /docs for the full OpenAPI surface.
"""

from tidal_dl_ru.logging_config import configure_logging

configure_logging("api")

from tidal_dl_ru.server.sentry_init import init_sentry

init_sentry()

import logging
import os

logger = logging.getLogger(__name__)
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from tidal_dl_ru.database.database import check_db, create_db_and_tables
from tidal_dl_ru.server.config_check import validate_production_config
from tidal_dl_ru.server.metrics import collect_metrics, record_health
from tidal_dl_ru.server.middleware import RateLimitMiddleware, SecurityHeadersMiddleware
from tidal_dl_ru.server.request_logging import RequestLoggingMiddleware
from tidal_dl_ru.server.settings import settings

validate_production_config()

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Initialize SQLite Database
    create_db_and_tables()
    try:
        app.state.arq = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    except Exception as e:
        if os.environ.get("TIDALDLRU_ENV") == "production":
            logger.error(f"Failed to connect to Redis in production: {e}")
            raise e
        logger.info(f"Warning: Could not connect to Redis ({e}). ARQ queue won't work.")
        app.state.arq = None
    try:
        yield
    finally:
        if getattr(app.state, "arq", None):
            await app.state.arq.close()


app = FastAPI(title="FlacAud API", version="0.1.0", lifespan=lifespan)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)

def _arq(app: FastAPI) -> ArqRedis:
    return app.state.arq

from tidal_dl_ru.server.routers.auth import router as auth_router
from tidal_dl_ru.server.routers.connected_accounts import router as connected_accounts_router
from tidal_dl_ru.server.routers.jobs import router as jobs_router
from tidal_dl_ru.server.routers.library import router as library_router
from tidal_dl_ru.server.routers.match_rules import router as match_rules_router
from tidal_dl_ru.server.routers.sets import router as sets_router
from tidal_dl_ru.server.routers.share import router as share_router
from tidal_dl_ru.server.routers.subscription import router as subscription_router
from tidal_dl_ru.server.routers.transfer import router as transfer_router

app.include_router(auth_router)
app.include_router(library_router)
app.include_router(jobs_router)
app.include_router(sets_router)
app.include_router(share_router)
app.include_router(transfer_router)
app.include_router(connected_accounts_router)
app.include_router(match_rules_router)
app.include_router(subscription_router)


@app.get("/healthz")
def healthz() -> dict:
    redis_ok = False
    try:
        arq = getattr(app.state, "arq", None)
        if arq is not None:
            redis_ok = True
    except Exception:
        pass
    db_ok = check_db()
    ok = db_ok and (redis_ok or os.environ.get("TIDALDLRU_ENV") != "production")
    record_health(ok=ok, db_ok=db_ok, redis_ok=redis_ok)

    return {
        "ok": ok,
        "db": db_ok,
        "redis": redis_ok,
        "version": app.version,
        **collect_metrics(),
    }


from tidal_dl_ru.server.routers.api import router as api_router
from tidal_dl_ru.server.routers.catalog import router as catalog_router
from tidal_dl_ru.server.routers.client_errors import router as client_errors_router
from tidal_dl_ru.server.routers.media import router as media_router

app.include_router(api_router)
app.include_router(client_errors_router)
app.include_router(catalog_router)
app.include_router(media_router)

# ==========================================
# MOUNT FRONTEND
# ==========================================
frontend_dist = Path(__file__).parent.parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)

        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)

        return FileResponse(frontend_dist / "index.html")

