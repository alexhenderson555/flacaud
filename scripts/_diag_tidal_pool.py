#!/usr/bin/env python3
"""SSH diagnostic: Tidal pool + API health on production."""
from __future__ import annotations

import os
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

import paramiko

HOST = os.environ.get("TIDAL_HOST", "46.17.102.157")
PATH = os.environ.get("DEPLOY_PATH", "/opt/tidal-dl-ru")
COMPOSE = (
    "docker compose -f docker-compose.yml -f docker-compose.prod.yml "
    "-f docker-compose.postgres.yml -f docker-compose.observability.yml"
)


def main() -> int:
    pw = os.environ.get("TIDAL_SSH_PASSWORD")
    if not pw:
        print("Missing TIDAL_SSH_PASSWORD in .env", file=sys.stderr)
        return 1

    cmds = [
        "docker ps --format '{{.Names}} {{.Status}}' | grep tidal || true",
        "ss -tlnp | grep -E ':443|:8000|:80' || true",
        "curl -s -o /dev/null -w 'providers_local=%{http_code}\\n' http://127.0.0.1:8000/api/providers || true",
        "curl -s -o /dev/null -w 'providers_https=%{http_code}\\n' -k https://127.0.0.1/api/providers -H 'Host: flacaud.ru' || true",
        f"cd {PATH} && {COMPOSE} exec -T api python -c \""
        "from tidal_dl_ru.providers.tidal import pool; print('pool', pool.pool_size())\"",
        f"cd {PATH} && {COMPOSE} exec -T caddy wget -qO- http://api:8000/api/providers 2>&1 | head -c 300",
        f"cd {PATH} && {COMPOSE} exec -T api curl -s -o /dev/null -w 'api_internal=%{{http_code}}\\n' http://127.0.0.1:8000/api/providers",
        "curl -s -o /dev/null -w 'external_domain=%{http_code}\\n' https://flacaud.ru/api/providers || true",
        "curl -s -o /dev/null -w 'external_ip=%{http_code}\\n' -k https://46.17.102.157/api/providers -H 'Host: flacaud.ru' || true",
        f"cd {PATH} && {COMPOSE} exec -T api python -c \""
        "import httpx\n"
        "from tidal_dl_ru.providers.tidal import pool\n"
        "from tidal_dl_ru.providers.tidal.client import TidalClient\n"
        "http = httpx.Client(timeout=30)\n"
        "acc, tokens = pool.acquire(http)\n"
        "c = TidalClient(http=http, tokens=tokens)\n"
        "r = c.search('beatles', 3)\n"
        "print('search_type', type(r).__name__)\n"
        "if isinstance(r, list):\n"
        "    print('search_ok', len(r), [getattr(t, 'title', t) for t in r[:2]])\n"
        "else:\n"
        "    print('search_raw', r)\"",
        f"cd {PATH} && {COMPOSE} exec -T api python -c \""
        "from tidal_dl_ru.providers.tidal.manifest_fetch import fetch_playback_manifest\n"
        "from tidal_dl_ru.providers.tidal.models import AudioQuality\n"
        "for tid in ('55130739', '1257546'):\n"
        "  for q in (AudioQuality.HIGH, AudioQuality.LOSSLESS):\n"
        "    m, rl = fetch_playback_manifest(tid, q)\n"
        "    print(tid, q.name, 'manifest', 'ok' if m else 'NONE', 'rate_limited', rl)\"",
        f"cd {PATH} && {COMPOSE} logs api --tail 100 2>/dev/null | "
        "grep -iE 'tidal|pool|NoAccount|429|stream_failed|rate_limit' | tail -n 20 || true",
        f"cd {PATH} && {COMPOSE} logs caddy --tail 30 2>/dev/null || true",
    ]

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=os.environ.get("TIDAL_SSH_USER", "root"), password=pw, timeout=30)
    try:
        for cmd in cmds:
            print(f"\n=== {cmd[:100]}... ===" if len(cmd) > 100 else f"\n=== {cmd} ===")
            _, stdout, stderr = ssh.exec_command(cmd, timeout=180)
            out = stdout.read().decode("utf-8", "replace").strip()
            err = stderr.read().decode("utf-8", "replace").strip()
            if out:
                sys.stdout.buffer.write(out.encode("utf-8", errors="replace") + b"\n")
            if err:
                print("STDERR:", err)
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
