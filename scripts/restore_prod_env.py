#!/usr/bin/env python3
"""Restore prod .env secrets from running api container if tarball overwrote them."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except ImportError:
    pass

import paramiko

HOST = os.environ.get("TIDAL_HOST", "46.17.102.157")
USER = os.environ.get("TIDAL_SSH_USER", "root")
PATH = os.environ.get("DEPLOY_PATH", "/opt/tidal-dl-ru")

KEYS = (
    "TIDALDLRU_JWT_SECRET",
    "TIDALDLRU_SIGNING_SECRET",
    "TIDALDLRU_BOT_TOKEN",
    "TIDALDLRU_POOL_KEY",
    "GEMINI_API_KEY",
    "TIDALDLRU_AUDD_TOKEN",
)


def main() -> int:
    pw = os.environ.get("TIDAL_SSH_PASSWORD")
    if not pw:
        print("Missing TIDAL_SSH_PASSWORD", file=sys.stderr)
        return 1

    keys = " ".join(KEYS)
    remote = (
        f"cd {PATH} && "
        "for svc in tidal-dl-ru-api tidal-dl-ru-bot tidal-dl-ru-worker; do "
        '  cid=$(docker ps -q --filter "name=$svc" | head -1) || true; '
        '  [ -n "$cid" ] || continue; '
        f"  for k in {keys}; do "
        '    if grep -q "^$k=" .env 2>/dev/null; then continue; fi; '
        '    v=$(docker inspect "$cid" --format "{{range .Config.Env}}{{println .}}{{end}}" '
        "| grep \"^$k=\" | head -1 | cut -d= -f2-); "
        '    if [ -n "$v" ]; then echo "$k=$v" >> .env; echo "restored:$k"; fi; '
        "  done; "
        "done && "
        "wc -c .env"
    )

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=pw, timeout=30)
    try:
        print(f"+ restore secrets on {HOST}")
        _, stdout, stderr = ssh.exec_command(remote, timeout=120)
        code = stdout.channel.recv_exit_status()
        out = stdout.read().decode("utf-8", "replace").strip()
        err = stderr.read().decode("utf-8", "replace").strip()
        if out:
            for line in out.splitlines():
                if line.startswith("restored:"):
                    print(line)
                else:
                    print(line)
        if err:
            print(err, file=sys.stderr)
        return code
    finally:
        ssh.close()


if __name__ == "__main__":
    raise SystemExit(main())
