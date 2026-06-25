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
py = r"""
import sqlite3
for p in ['/root/.config/tidal-dl-ru/pool.db','/root/.config/FlacAud/pool.db']:
    try:
        c=sqlite3.connect(p)
        n=c.execute('select count(*) from tidal_accounts').fetchone()[0]
        print(p, 'accounts', n)
    except Exception as e:
        print(p, e)
"""
_ssh_run(TIDAL_HOST, TIDAL_USER, pw,
         f"cd /opt/tidal-dl-ru && docker compose exec -T api python -c {py!r}", timeout=60)

