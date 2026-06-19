"""Ops/admin endpoint protection via shared API key."""

from __future__ import annotations

import os

from fastapi import HTTPException, Request, status


def _ops_key() -> str:
    return os.environ.get("TIDALDLRU_OPS_API_KEY", "").strip()


def _is_production() -> bool:
    return os.environ.get("TIDALDLRU_ENV", "").strip().lower() == "production"


def require_ops_access(request: Request) -> None:
    """Gate metrics/pool/logs. Production always requires TIDALDLRU_OPS_API_KEY."""
    key = _ops_key()
    if _is_production() and not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not key:
        return
    supplied = (request.headers.get("X-Ops-Key") or "").strip()
    if supplied != key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ops key")
