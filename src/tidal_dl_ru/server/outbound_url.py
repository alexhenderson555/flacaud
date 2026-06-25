"""Validate user-supplied URLs before server-side fetch (yt-dlp, httpx, etc.)."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class OutboundUrlError(ValueError):
    """User-facing URL rejected before any outbound request."""


def validate_public_http_url(url: str, *, max_length: int = 2048) -> str:
    """Return normalized URL or raise if scheme/host resolves to non-public addresses."""
    normalized = (url or "").strip()
    if len(normalized) < 8 or len(normalized) > max_length:
        raise OutboundUrlError("Invalid URL length")

    parsed = urlparse(normalized)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise OutboundUrlError("URL must use http or https")

    hostname = parsed.hostname.lower()
    if hostname in ("localhost", "localhost.localdomain"):
        raise OutboundUrlError("Blocked host")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(hostname, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise OutboundUrlError("Cannot resolve host") from exc

    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError as exc:
            raise OutboundUrlError("Blocked address") from exc
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise OutboundUrlError("Blocked address")

    return normalized
