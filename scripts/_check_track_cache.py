#!/usr/bin/env python3
"""Diagnose a specific track's stream-cache file(s) - check for truncation
left over from the disk-full incident (416 Range Not Satisfiable = client
asked for bytes past what's actually on disk)."""
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

TRACK_ID = sys.argv[1] if len(sys.argv) > 1 else "366185225"

QUERY = (
    "from tidal_dl_ru.server.settings import settings\n"
    "import os\n"
    f"track_id = '{TRACK_ID}'\n"
    "cache_dir = settings.stream_cache_dir\n"
    "print('cache_dir:', cache_dir)\n"
    "found = []\n"
    "for root, dirs, files in os.walk(cache_dir):\n"
    "    for f in files:\n"
    "        if track_id in f:\n"
    "            p = os.path.join(root, f)\n"
    "            try:\n"
    "                size = os.path.getsize(p)\n"
    "            except OSError:\n"
    "                size = -1\n"
    "            found.append((p, size))\n"
    "if not found:\n"
    "    print('no cache files found for', track_id)\n"
    "for p, size in found:\n"
    "    print(p, 'size=%s bytes (%.2f MB)' % (size, size / 1_048_576))\n"
)


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    remote = (
        f"cd {DEPLOY_PATH} && "
        f"COMPOSE='{compose_files()}' && "
        f'$COMPOSE exec -T api python -c "{QUERY}"'
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=60)


if __name__ == "__main__":
    main()
