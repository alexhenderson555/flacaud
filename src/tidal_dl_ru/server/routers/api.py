from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Depends
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse
import asyncio
import collections
import httpx
import ipaddress
import json
import logging
import os
import random
import socket
import syncedlyrics
import tempfile

from tidal_dl_ru.server.schemas import SearchResponse, ProviderInfo, SearchRequest, PoolHealth
from tidal_dl_ru.core.router import all_providers, get_provider_by_name
from tidal_dl_ru.core.models import Track
from tidal_dl_ru.core.recognize import recognize_audio
from tidal_dl_ru.database.auth import get_current_user, get_media_user
from tidal_dl_ru.database.models import User
from tidal_dl_ru.database.database import get_session
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.auth import (
    extract_code_from_url, pkce_exchange_code, save_tokens, AuthError,
    load_tokens, pkce_login_url,
)
from tidal_dl_ru.providers.tidal.client import TidalClient, cover_url
from tidal_dl_ru.providers.tidal.download import download_track
from tidal_dl_ru.providers.tidal.models import AudioQuality
from tidal_dl_ru.providers.tidal.provider import _to_universal
from tidal_dl_ru.server import jobs as job_state
from tidal_dl_ru.server.files import verify_file
from tidal_dl_ru.server.payments import create_payment, process_webhook
from tidal_dl_ru.server.settings import settings
from tidal_dl_ru.bot.users import Plan

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/logs")
def get_app_logs():
    import os
    if os.path.exists("app.log"):
        with open("app.log", "r", encoding="utf-8") as f:
            return {"logs": f.read()}
    return {"logs": "No logs found."}

@router.post("/api/webhooks/yookassa")
async def yookassa_webhook(request: Request) -> dict:
    """YooKassa sends payment.succeeded notifications here."""
    client_ip = request.client.host if request.client else ""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
        
    allowed_subnets = [
        ipaddress.ip_network("185.71.76.0/27"),
        ipaddress.ip_network("185.71.77.0/27"),
        ipaddress.ip_network("77.75.153.0/25"),
        ipaddress.ip_network("77.75.156.11/32"),
        ipaddress.ip_network("77.75.156.35/32"),
        ipaddress.ip_network("77.75.154.128/25"),
        ipaddress.ip_network("2a02:5180::/32")
    ]
    try:
        ip_obj = ipaddress.ip_address(client_ip)
        if not any(ip_obj in subnet for subnet in allowed_subnets):
            # Accept locally for testing only
            if str(ip_obj) not in ("127.0.0.1", "::1"):
                raise HTTPException(status_code=403, detail="Invalid IP")
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid IP format")

    body = await request.json()
    ok = process_webhook(body)
    return {"ok": ok}

class PaymentCreateRequest(BaseModel):
    plan: str

@router.post("/api/payments/create")
async def api_create_payment(req: PaymentCreateRequest, current_user: User = Depends(get_current_user)):
    
    try:
        plan_enum = Plan(req.plan.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan")
        
    if not current_user.telegram_id:
        raise HTTPException(status_code=400, detail="Telegram account not linked")
    url = create_payment(current_user.telegram_id, plan_enum, return_url="http://localhost:5173/account")
    
    if not url:
        raise HTTPException(status_code=501, detail="YooKassa integration is not yet fully configured")
        
    return {"url": url}

@router.get("/api/pool/health", response_model=PoolHealth)
def pool_health() -> PoolHealth:
    c = tidal_pool.pool_size()
    return PoolHealth(
        total=c["total"],
        active=c.get("active", 0),
        banned=c.get("banned", 0),
        exhausted=c.get("exhausted", 0),
    )

@router.get("/api/auth/status")
def auth_status():
    t = load_tokens()
    if t and t.access_token:
        return {"logged_in": True, "user_id": t.user_id, "country": t.country_code}
    return {"logged_in": False}

@router.get("/api/auth/login")
def auth_login_url():
    url, verifier = pkce_login_url()
    return {"url": url, "verifier": verifier}

class AuthCallback(BaseModel):
    redirect_url: str
    verifier: str

@router.post("/api/auth/callback")
def auth_callback(req: AuthCallback):
    
    try:
        code = extract_code_from_url(req.redirect_url)
        with httpx.Client() as c:
            tokens = pkce_exchange_code(c, code, req.verifier)
            save_tokens(tokens)
        return {"ok": True}
    except AuthError as e:
        raise HTTPException(status_code=400, detail="Internal Server Error")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal Server Error")
