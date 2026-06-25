#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

from scripts.repair_servers import TIDAL_HOST, TIDAL_USER, _password, _ssh_run

PROD_IP = os.environ.get("TIDAL_HOST", os.environ.get("DEPLOY_HOST", TIDAL_HOST))


def test_public_search() -> None:
    ctx = ssl.create_default_context()
    body = json.dumps({"query": "moderat", "limit": 3}).encode()
    req = urllib.request.Request(
        "https://flacaud.ru/api/search",
        data=body,
        headers={"Content-Type": "application/json", "Host": "flacaud.ru"},
        method="POST",
    )
    # Force correct origin (bypass stale local DNS)
    import http.client

    conn = http.client.HTTPSConnection(PROD_IP, context=ctx)
    conn.request("POST", "/api/search", body=body, headers={
        "Host": "flacaud.ru",
        "Content-Type": "application/json",
    })
    resp = conn.getresponse()
    data = resp.read(2000)
    print(f"public search -> {resp.status}")
    print(data.decode("utf-8", "replace")[:1200])


def main() -> None:
    try:
        test_public_search()
    except Exception as e:
        print(f"public search check skipped: {e}")
    pw = _password("TIDAL_SSH_PASSWORD")
    cmds = [
        "cd /opt/tidal-dl-ru && docker compose logs api --tail 120 2>&1 | grep -iE 'search|pool|429|unavailable|Tidal search' | tail -30",
        (
            "cd /opt/tidal-dl-ru && docker compose exec -T api python -c "
            "\"import json,urllib.request; "
            "r=urllib.request.urlopen(urllib.request.Request("
            "'http://127.0.0.1:8000/api/search',"
            "data=json.dumps({'query':'moderat','limit':3}).encode(),"
            "headers={'Content-Type':'application/json'},method='POST'),timeout=30); "
            "print('inside', r.status, r.read()[:600])\""
        ),
        "ls -la /root/.config/tidal-dl-ru/ 2>/dev/null; ls -la /root/.config/FlacAud/ 2>/dev/null; true",
        (
            "cd /opt/tidal-dl-ru && docker compose exec -T api python -c "
            "\"from tidal_dl_ru.providers.tidal.pool import TidalPool; "
            "p=TidalPool(); print('accounts', len(p.list_accounts()))\""
        ),
    ]
    for cmd in cmds:
        _ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=120)


if __name__ == "__main__":
    main()
