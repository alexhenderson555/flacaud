"""Shared ops script environment helpers."""

from __future__ import annotations

import os
import sys


def tidal_host(*, required: bool = True) -> str:
    host = (os.environ.get("TIDAL_HOST") or os.environ.get("DEPLOY_HOST") or "").strip()
    if not host and required:
        print("Set TIDAL_HOST or DEPLOY_HOST (e.g. in .env)", file=sys.stderr)
        raise SystemExit(1)
    return host
