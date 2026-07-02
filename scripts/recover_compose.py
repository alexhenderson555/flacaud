#!/usr/bin/env python3
"""Recover prod compose after interrupted deploy (container name conflicts)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env", override=True)


    if (ROOT / ".env.local").is_file():


        load_dotenv(ROOT / ".env.local", override=True)
except ImportError:
    pass

sys.path.insert(0, str(ROOT / "scripts"))
from scripts.repair_servers import (  # noqa: E402
    DEPLOY_PATH,
    TIDAL_HOST,
    TIDAL_USER,
    _password,
    _ssh_run,
    compose_files,
    smoke_tidal,
    verify_password_reset_mail_ready,
)


def main() -> int:
    pw = _password("TIDAL_SSH_PASSWORD")
    cf = compose_files()
    remote = (
        f"cd {DEPLOY_PATH} && COMPOSE='{cf}' && "
        "$COMPOSE down --remove-orphans 2>/dev/null || true && "
        "docker ps -a --format '{{.Names}}' | grep tidal-dl-ru | xargs -r docker rm -f 2>/dev/null || true && "
        "$COMPOSE up -d --remove-orphans && "
        "bash ops/prune-frontend-dist.sh frontend/dist 2>/dev/null || true && "
        "$COMPOSE up -d caddy && $COMPOSE restart caddy api bot"
    )
    code = _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=900)
    if code != 0:
        return code
    smoke_tidal()
    verify_password_reset_mail_ready()
    print("Remote compose recovery complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
