#!/usr/bin/env python3
"""Remediation: earlier silent-death deploys left the remote docker compose
stack with dangling/orphaned containers whose names collide with the ones
compose wants to (re)create. List all tidal-dl-ru containers, remove any
that aren't the ones compose currently expects, then bring the stack up
cleanly."""
from __future__ import annotations

import os
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
from _ops_env import tidal_host  # noqa: E402

os.environ.setdefault("TIDAL_HOST", os.environ.get("DEPLOY_HOST") or tidal_host(required=False) or "")

from scripts.repair_servers import TIDAL_HOST, TIDAL_USER, _ssh_run, _password, compose_files, DEPLOY_PATH  # noqa: E402


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    remote = (
        f"cd {DEPLOY_PATH} && "
        f"COMPOSE='{compose_files()}' && "
        "echo '=== all tidal-dl-ru containers ===' && "
        "docker ps -a --filter 'name=tidal-dl-ru' --format '{{.ID}}  {{.Names}}  {{.Status}}' && "
        "echo '=== compose ps ===' && "
        "$COMPOSE ps -a && "
        "echo '=== removing exited/dead non-compose-tracked duplicates ===' && "
        "for id in $(docker ps -a --filter 'name=tidal-dl-ru-worker-1' --filter 'name=tidal-dl-ru-api-1' -q); do "
        "  name=$(docker inspect --format '{{.Name}}' $id | sed 's#^/##'); "
        "  state=$(docker inspect --format '{{.State.Status}}' $id); "
        "  echo \"container $id ($name) state=$state\"; "
        "done && "
        "echo '=== bringing stack up ===' && "
        "$COMPOSE up -d --remove-orphans && "
        "echo '=== final ps ===' && "
        "$COMPOSE ps"
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=300)


if __name__ == "__main__":
    main()
