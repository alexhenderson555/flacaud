#!/usr/bin/env python3
"""Set Grafana admin password on production (DB + server .env)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env", override=True)
except ImportError:
    pass

from scripts.repair_servers import (  # noqa: E402
    DEPLOY_PATH,
    TIDAL_HOST,
    TIDAL_USER,
    _password,
    _remote_env_upserts,
    _ssh_run,
    compose_files,
)


def main() -> None:
    new_password = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("GRAFANA_ADMIN_PASSWORD", "")).strip()
    if not new_password:
        raise SystemExit("Usage: set_grafana_password.py <password> or set GRAFANA_ADMIN_PASSWORD")

    os.environ["GRAFANA_ADMIN_PASSWORD"] = new_password
    pw = _password("TIDAL_SSH_PASSWORD")
    cf = compose_files()
    env_snippet = _remote_env_upserts(("GRAFANA_ADMIN_PASSWORD",))
    safe = new_password.replace("'", "'\"'\"'")
    cmd = (
        f"cd {DEPLOY_PATH} && touch .env && {env_snippet}"
        f"COMPOSE='{cf}' && $COMPOSE exec -T grafana grafana cli admin reset-admin-password '{safe}'"
    )
    code = _ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=60)
    if code != 0:
        raise SystemExit(code)
    print("Grafana admin password updated on server.")


if __name__ == "__main__":
    main()
