#!/usr/bin/env python3
"""Check actual filesystem disk usage on the tidal server, plus docker's own
disk footprint (images/containers/volumes/build cache) - read-only."""
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
        "echo '=== df -h ===' && df -h && "
        "echo '=== docker system df ===' && docker system df -v 2>&1 | head -60 && "
        f"echo '=== du of {DEPLOY_PATH} ===' && du -sh {DEPLOY_PATH}/* 2>/dev/null | sort -rh | head -20"
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=120)


if __name__ == "__main__":
    main()
