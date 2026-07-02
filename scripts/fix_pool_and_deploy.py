#!/usr/bin/env python3
"""Restore Tidal pool path on prod and redeploy API with config fix."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")


if (ROOT / ".env.local").is_file():


    load_dotenv(ROOT / ".env.local", override=True)

os.environ.setdefault("DEPLOY_DOMAIN", "flacaud.ru")
os.environ.setdefault("DOMAIN", "flacaud.ru")
os.environ.setdefault("TIDALDLRU_PUBLIC_API_BASE", "https://flacaud.ru")

from scripts.repair_servers import (
    TIDAL_HOST,
    TIDAL_USER,
    _password,
    _ssh_run,
    deploy_tidal_server,
    smoke_tidal,
)

pw = _password("TIDAL_SSH_PASSWORD")

HOTFIX = (
    "cd /opt/tidal-dl-ru && "
    "for svc in api worker; do "
    "docker compose exec -T $svc sh -c '"
    "mkdir -p /root/.config/FlacAud && "
    "cp -f /root/.config/tidal-dl-ru/pool.db /root/.config/FlacAud/pool.db && "
    "cp -f /root/.config/tidal-dl-ru/pool.key /root/.config/FlacAud/pool.key 2>/dev/null || true"
    "'; done && "
    "docker compose restart api worker"
)

print("Hotfix: copy pool.db to FlacAud path (current running image)...")
_ssh_run(TIDAL_HOST, TIDAL_USER, pw, HOTFIX, timeout=180)

print("Deploy with CONFIG_DIR fix...")
deploy_tidal_server()
smoke_tidal()

VERIFY = (
    "cd /opt/tidal-dl-ru && docker compose exec -T api python -c "
    "'from tidal_dl_ru.providers.tidal.pool import list_accounts; "
    "print(\"accounts\", len(list_accounts()))' && "
    "docker compose exec -T api python -c "
    "'import json,urllib.request; "
    "r=urllib.request.urlopen(urllib.request.Request("
    "'http://127.0.0.1:8000/api/search',"
    "data=json.dumps({\"query\":\"moderat\",\"limit\":2}).encode(),"
    "headers={\"Content-Type\":\"application/json\"},method=\"POST\"),timeout=30); "
    "print(\"search\", r.status, len(r.read()))'"
)
print("Verify pool + search...")
_ssh_run(TIDAL_HOST, TIDAL_USER, pw, VERIFY, timeout=120)
