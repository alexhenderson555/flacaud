#!/usr/bin/env python3
"""Rollback production stack to a previous image tag."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")


    if (ROOT / ".env.local").is_file():


        load_dotenv(ROOT / ".env.local", override=True)
except ImportError:
    pass

from scripts.repair_servers import (  # noqa: E402
    COMPOSE_FILES,
    DEPLOY_PATH,
    IMAGE_ENV_KEYS,
    TIDAL_HOST,
    TIDAL_USER,
    _password,
    _remote_env_upserts,
    _ssh_run,
)


def main() -> None:
    rollback_tag = (os.environ.get("ROLLBACK_TAG") or os.environ.get("FLACAUD_TAG") or "").strip()
    if not rollback_tag:
        raise SystemExit("Set ROLLBACK_TAG (or FLACAUD_TAG) to rollback target tag")

    os.environ["FLACAUD_TAG"] = rollback_tag
    image_env = _remote_env_upserts(IMAGE_ENV_KEYS)
    pw = _password("TIDAL_SSH_PASSWORD")
    remote = (
        f"cd {DEPLOY_PATH} && touch .env && "
        f"{image_env}"
        f"COMPOSE='{COMPOSE_FILES}' && "
        "$COMPOSE pull api worker bot && "
        "$COMPOSE up -d --remove-orphans && "
        "$COMPOSE restart caddy api bot && "
        "$COMPOSE ps"
    )
    code = _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=1200)
    if code != 0:
        raise SystemExit(f"Rollback failed with exit {code}")
    print(f"Rollback complete (tag={rollback_tag})")


if __name__ == "__main__":
    main()
