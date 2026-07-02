#!/usr/bin/env python3
"""Measure track radio endpoint latency on prod (via SSH)."""
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
USER = os.environ.get("TIDAL_SSH_USER", "root")
TRACK = "1563698"


def main() -> int:
    pw = os.environ.get("TIDAL_SSH_PASSWORD")
    if not pw:
        print("Missing TIDAL_SSH_PASSWORD", file=sys.stderr)
        return 1

    cmds = [
        "curl -sk -o /dev/null -w 'library:%{http_code} time=%{time_total}s\\n' https://proshli.ru/library",
        f"curl -sk -o /dev/null -w 'radio_full:%{{http_code}} time=%{{time_total}}s\\n' "
        f"'https://proshli.ru/api/track/tidal/{TRACK}/radio?limit=15'",
    ]
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=pw, timeout=30)
    try:
        for cmd in cmds:
            print(f"+ {cmd}")
            _, stdout, _ = ssh.exec_command(cmd, timeout=120)
            print(stdout.read().decode("utf-8", "replace").strip())
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
