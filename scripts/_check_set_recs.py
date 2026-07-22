#!/usr/bin/env python3
"""One-off diagnostic: time the _blend_queries path used by /api/sets/recommendations."""
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

QUERY = (
    "import asyncio, time\n"
    "from tidal_dl_ru.core.set_search import search_sets\n"
    "t0 = time.time()\n"
    "try:\n"
    "    rows = search_sets('boiler room dj set', 12)\n"
    "    print('single query OK in %.1fs, %d results' % (time.time() - t0, len(rows)))\n"
    "except Exception as e:\n"
    "    print('single query FAILED after %.1fs: %r' % (time.time() - t0, e))\n"
)


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    remote = (
        f"cd {DEPLOY_PATH} && "
        f"COMPOSE='{compose_files()}' && "
        f'$COMPOSE exec -T api python -c "{QUERY}"'
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=90)


if __name__ == "__main__":
    main()
