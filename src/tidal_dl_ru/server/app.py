from __future__ import annotations
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("app.log", encoding="utf-8")
    ]
)
logger = logging.getLogger(__name__)
"""FastAPI app — REST surface over the CLI core.

Endpoints (no auth in this MVP; gateway / Telegram-login arrives in Phase 2):
  GET  /healthz
  GET  /api/providers           — list providers
  POST /api/search              — provider search
  POST /api/jobs                — create a download job (queued to ARQ)
  GET  /api/jobs/{id}           — job status + per-track progress
  GET  /api/files/{token}       — download a finished file (signed token)
  GET  /api/pool/health         — Tidal account pool counts (admin)
"""


from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
import httpx
from datetime import timedelta

from tidal_dl_ru.database.database import create_db_and_tables
from tidal_dl_ru.database.models import User, UserCreate, UserRead, SavedTrack, Playlist, SavedTrackBase, PlaylistBase
from tidal_dl_ru.database.auth import get_password_hash, verify_password, create_access_token, get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES
from sqlmodel import Session
from tidal_dl_ru.database.database import get_session
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Depends
from typing import List

from tidal_dl_ru.core.router import all_providers, get_provider_by_name
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.files import verify_file
from tidal_dl_ru.server.schemas import (
    JobCreate,
    JobStatus,
    PoolHealth,
    ProviderInfo,
    SearchRequest,
    SearchResponse,
)
from tidal_dl_ru.server.payments import create_payment, process_webhook
from tidal_dl_ru.server.settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Initialize SQLite Database
    create_db_and_tables()
    try:
        app.state.arq = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    except Exception as e:
        logger.info(f"Warning: Could not connect to Redis ({e}). ARQ queue won't work.")
        app.state.arq = None
    try:
        yield
    finally:
        if getattr(app.state, "arq", None):
            await app.state.arq.close()


app = FastAPI(title="tidal-dl-ru API", version="0.1.0", lifespan=lifespan)


def _arq(app: FastAPI) -> ArqRedis:
    return app.state.arq

from tidal_dl_ru.server.routers.auth import router as auth_router
from tidal_dl_ru.server.routers.library import router as library_router
from tidal_dl_ru.server.routers.jobs import router as jobs_router

app.include_router(auth_router)
app.include_router(library_router)
app.include_router(jobs_router)


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}



from tidal_dl_ru.server.routers.api import router as api_router
app.include_router(api_router)

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

