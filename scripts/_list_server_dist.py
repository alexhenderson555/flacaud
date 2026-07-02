#!/usr/bin/env python3
"""List frontend dist artifacts on production server."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")

    if (ROOT / ".env.local").is_file():

        load_dotenv(ROOT / ".env.local", override=True)
except ImportError:
    pass

from repair_servers import TIDAL_HOST, TIDAL_USER, _password, _ssh_run

pw = _password("TIDAL_SSH_PASSWORD")
cmds = [
    "ls -la /opt/tidal-dl-ru/frontend/dist/assets/index-*.js 2>/dev/null",
    "ls -la /opt/tidal-dl-ru/frontend/dist/assets/*.map 2>/dev/null | head -20",
    "grep -o 'index-[A-Za-z0-9_-]*\\.js' /opt/tidal-dl-ru/frontend/dist/index.html",
    "wc -c /opt/tidal-dl-ru/frontend/dist/assets/index-*.js 2>/dev/null",
    "docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}}' | grep flacaud | head -10",
]
for c in cmds:
    print("\n===", c, "===\n")
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, c, timeout=90)
