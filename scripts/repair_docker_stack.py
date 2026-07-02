#!/usr/bin/env python3
"""Remove stale tidal containers and bring stack back up."""
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

import paramiko

HOST = os.environ.get("TIDAL_HOST", "46.17.102.157")
USER = os.environ.get("TIDAL_SSH_USER", "root")
PATH = os.environ.get("DEPLOY_PATH", "/opt/tidal-dl-ru")


def main() -> int:
    pw = os.environ.get("TIDAL_SSH_PASSWORD")
    if not pw:
        print("Missing TIDAL_SSH_PASSWORD", file=sys.stderr)
        return 1

    remote = (
        f"cd {PATH} && "
        "docker rm -f $(docker ps -aq --filter name=tidal-dl-ru) 2>/dev/null || true && "
        "COMPOSE='docker compose -f docker-compose.yml -f docker-compose.prod.yml' && "
        "$COMPOSE up -d --remove-orphans && "
        "bash ops/prune-frontend-dist.sh frontend/dist 2>/dev/null || true && "
        "$COMPOSE restart caddy api"
    )

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=pw, timeout=30)
    try:
        print(f"+ repair on {HOST}")
        _, stdout, stderr = ssh.exec_command(remote, timeout=300)
        code = stdout.channel.recv_exit_status()
        out = stdout.read().decode("utf-8", "replace").strip()
        err = stderr.read().decode("utf-8", "replace").strip()
        if out:
            print(out)
        if err:
            print(err, file=sys.stderr)
        return code
    finally:
        ssh.close()


if __name__ == "__main__":
    raise SystemExit(main())
