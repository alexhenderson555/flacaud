import asyncio
import ipaddress
import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from tidal_dl_ru.bot.users import Plan
from tidal_dl_ru.database.auth import get_current_user
from tidal_dl_ru.database.models import User
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.auth import (
    AuthError,
    extract_code_from_url,
    load_tokens,
    pkce_exchange_code,
    pkce_login_url,
    save_tokens,
)
from tidal_dl_ru.server.activation_codes import redeem_code
from tidal_dl_ru.server.metrics import collect_metrics, collect_prometheus_metrics
from tidal_dl_ru.server.metrics_auth import require_metrics_access
from tidal_dl_ru.server.ops_auth import require_ops_access
from tidal_dl_ru.server.payments import create_payment, process_webhook
from tidal_dl_ru.server.schemas import PoolHealth

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/metrics")
def app_metrics(request: Request) -> dict:
    """Process metrics for ops (uptime, recommendation cache)."""
    require_ops_access(request)
    return collect_metrics()


@router.get("/api/metrics/prometheus")
def app_metrics_prometheus(request: Request) -> PlainTextResponse:
    require_metrics_access(request)
    return PlainTextResponse(collect_prometheus_metrics(), media_type="text/plain; version=0.0.4")


@router.get("/internal/metrics/prometheus")
def internal_metrics_prometheus(request: Request) -> PlainTextResponse:
    """Prometheus scrape target on the Docker network (no ops key)."""
    require_metrics_access(request)
    return PlainTextResponse(collect_prometheus_metrics(), media_type="text/plain; version=0.0.4")


@router.get("/api/logs")
def get_app_logs(request: Request):
    require_ops_access(request)
    log_path = os.environ.get("TIDALDLRU_LOG_FILE", "app.log")
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8") as f:
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
    # process_webhook does blocking httpx + DB I/O; offload so it doesn't stall the event loop.
    ok = await asyncio.to_thread(process_webhook, body)
    return {"ok": ok}

class PaymentCreateRequest(BaseModel):
    plan: str


class RedeemCodeRequest(BaseModel):
    code: str


@router.post("/api/activation/redeem")
def api_redeem_code(req: RedeemCodeRequest, current_user: User = Depends(get_current_user)):
    ok, message = redeem_code(
        req.code,
        user_id=current_user.id,
        telegram_id=current_user.telegram_id,
    )
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"ok": True, "message": message}

@router.post("/api/payments/create")
async def api_create_payment(req: PaymentCreateRequest, current_user: User = Depends(get_current_user)):

    try:
        plan_enum = Plan(req.plan.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan")

    return_url = os.environ.get("TIDALDLRU_PAYMENT_RETURN_URL", "http://localhost:5173/account")
    # create_payment makes a blocking httpx call; offload it off the event loop.
    if current_user.telegram_id:
        url = await asyncio.to_thread(
            create_payment,
            plan_enum,
            return_url=return_url,
            telegram_id=current_user.telegram_id,
        )
    else:
        url = await asyncio.to_thread(
            create_payment,
            plan_enum,
            return_url=return_url,
            user_id=current_user.id,
        )

    if not url:
        raise HTTPException(status_code=501, detail="YooKassa integration is not yet fully configured")

    return {"url": url}

@router.get("/api/pool/health", response_model=PoolHealth)
def pool_health(request: Request) -> PoolHealth:
    require_ops_access(request)
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
    except AuthError:
        raise HTTPException(status_code=400, detail="Internal Server Error")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal Server Error")
