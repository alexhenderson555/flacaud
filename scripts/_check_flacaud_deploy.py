#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")

    if (ROOT / ".env.local").is_file():

        load_dotenv(ROOT / ".env.local", override=True)
except ImportError:
    pass

from scripts.repair_servers import TIDAL_HOST, TIDAL_USER, _password, _ssh_run

pw = _password("TIDAL_SSH_PASSWORD")
cmds = [
    "cd /opt/tidal-dl-ru && grep -E '^(DOMAIN|TIDALDLRU_PUBLIC_API_BASE)=' .env",
    "cd /opt/tidal-dl-ru && COMPOSE='docker compose -f docker-compose.yml -f docker-compose.prod.yml' && $COMPOSE ps",
    "curl -sk -o /dev/null -w 'https_local:%{http_code}\\n' https://127.0.0.1/api/providers -H 'Host: flacaud.ru' || true",
    "cd /opt/tidal-dl-ru && COMPOSE='docker compose -f docker-compose.yml -f docker-compose.prod.yml' && $COMPOSE logs caddy --tail 50",
]
for cmd in cmds:
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=120)
