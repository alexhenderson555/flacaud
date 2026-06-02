"""Fail fast when production secrets are missing."""

from __future__ import annotations

import os
import sys


def validate_production_config() -> None:
    if os.environ.get("TIDALDLRU_ENV") != "production":
        return
    missing = []
    for name in ("TIDALDLRU_JWT_SECRET", "TIDALDLRU_SIGNING_SECRET"):
        if not os.environ.get(name):
            missing.append(name)
    if missing:
        msg = f"Production requires: {', '.join(missing)}"
        print(msg, file=sys.stderr)
        raise RuntimeError(msg)
