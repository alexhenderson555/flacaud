#!/usr/bin/env python3
"""Upload Caddyfile + dist mount config and restart Caddy only (fast fix)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.repair_servers import TIDAL_HOST, TIDAL_USER, _password, _ssh_run  # noqa: E402


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    import paramiko
    from scp import SCPClient

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)
    try:
        with SCPClient(ssh.get_transport()) as scp:
            scp.put(str(ROOT / "ops" / "Caddyfile"), remote_path="/opt/tidal-dl-ru/ops/Caddyfile")
            scp.put(
                str(ROOT / "docker-compose.prod.yml"),
                remote_path="/opt/tidal-dl-ru/docker-compose.prod.yml",
            )
    finally:
        ssh.close()

    code = _ssh_run(
        TIDAL_HOST,
        TIDAL_USER,
        pw,
        "cd /opt/tidal-dl-ru && COMPOSE='docker compose -f docker-compose.yml -f docker-compose.prod.yml' "
        "&& $COMPOSE up -d --force-recreate caddy",
        timeout=120,
    )
    raise SystemExit(code)


if __name__ == "__main__":
    main()
