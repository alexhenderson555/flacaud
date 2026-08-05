#!/usr/bin/env python3
"""Run the app's own run_disk_cleanup() directly inside the api container to
enforce the stream-cache/set-audio-cache size caps immediately, and check
whether disk_cleanup_task is actually registered as an ARQ cron job."""
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

from scripts.repair_servers import (  # noqa: E402
    DEPLOY_PATH,
    TIDAL_HOST,
    TIDAL_USER,
    _password,
    _ssh_run,
    compose_files,
)

QUERY = (
    "from tidal_dl_ru.server.disk_cleanup import run_disk_cleanup\n"
    "stats = run_disk_cleanup()\n"
    "print('cleanup stats:', stats)\n"
)


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    remote = (
        f"cd {DEPLOY_PATH} && "
        f"COMPOSE='{compose_files()}' && "
        f'$COMPOSE exec -T api python -c "{QUERY}" && '
        "echo '=== df after cleanup ===' && df -h / && "
        "echo '=== worker cron registration ===' && "
        "$COMPOSE exec -T worker python -c \"from tidal_dl_ru.server.worker import WorkerSettings; print([str(f) for f in getattr(WorkerSettings, 'cron_jobs', [])])\" 2>&1 || true"
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=180)


if __name__ == "__main__":
    main()
