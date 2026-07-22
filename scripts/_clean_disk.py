#!/usr/bin/env python3
"""Free disk space on the tidal server: prune docker build cache (safe, just
cached image layers) and dangling images/containers. Does NOT touch live
volumes (stream-cache, jobs-data, pg-data, etc)."""
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

from scripts.repair_servers import TIDAL_HOST, TIDAL_USER, _ssh_run, _password  # noqa: E402


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    remote = (
        "echo '=== before ===' && df -h / && "
        "echo '=== docker builder prune ===' && docker builder prune -af && "
        "echo '=== docker image prune (dangling only) ===' && docker image prune -f && "
        "echo '=== docker container prune (stopped) ===' && docker container prune -f && "
        "echo '=== after ===' && df -h /"
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=180)


if __name__ == "__main__":
    main()
