#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv(ROOT / ".env")
from scripts.repair_servers import TIDAL_HOST, TIDAL_USER, _password, _ssh_run

pw = _password("TIDAL_SSH_PASSWORD")
_ssh_run(TIDAL_HOST, TIDAL_USER, pw,
    "cd /opt/tidal-dl-ru && docker compose exec -T api python /app/scripts/_search_smoke.py",
    timeout=60)
