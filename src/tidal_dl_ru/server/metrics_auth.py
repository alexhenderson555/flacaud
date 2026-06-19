"""Ops scrape auth: internal Docker network or X-Ops-Key."""

from __future__ import annotations

import ipaddress

from fastapi import Request

from tidal_dl_ru.server.ops_auth import require_ops_access


_PRIVATE_NETS = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return ""


def is_internal_scrape(request: Request) -> bool:
    ip_raw = _client_ip(request)
    if not ip_raw:
        return False
    try:
        ip_obj = ipaddress.ip_address(ip_raw)
    except ValueError:
        return False
    return any(ip_obj in net for net in _PRIVATE_NETS)


def require_metrics_access(request: Request) -> None:
    if is_internal_scrape(request):
        return
    require_ops_access(request)
