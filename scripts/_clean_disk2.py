#!/usr/bin/env python3
"""Follow-up disk cleanup: docker builder prune reclaimed 0B despite system df
reporting 64GB build cache - check buildx builders and prune those too, plus
find the actual biggest directories under /var/lib/docker."""
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

from scripts.repair_servers import TIDAL_HOST, TIDAL_USER, _password, _ssh_run  # noqa: E402


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    remote = (
        "echo '=== buildx builders ===' && docker buildx ls && "
        "echo '=== buildx du ===' && docker buildx du 2>&1 | head -40 && "
        "echo '=== buildx prune all builders ===' && docker buildx prune -af 2>&1 && "
        "echo '=== docker system df after ===' && docker system df && "
        "echo '=== biggest dirs under /var/lib/docker ===' && "
        "du -sh /var/lib/docker/* 2>/dev/null | sort -rh | head -15 && "
        "echo '=== df after ===' && df -h /"
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=180)


if __name__ == "__main__":
    main()
