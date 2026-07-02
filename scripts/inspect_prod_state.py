#!/usr/bin/env python3
"""Inspect prod tidal state after failed deploy."""
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
PATH = os.environ.get("DEPLOY_PATH", "/opt/tidal-dl-ru")


def main() -> int:
    pw = os.environ.get("TIDAL_SSH_PASSWORD")
    if not pw:
        print("Missing TIDAL_SSH_PASSWORD", file=sys.stderr)
        return 1

    cmds = [
        f"ls -la {PATH}/.env* 2>/dev/null || true",
        f"wc -c {PATH}/.env 2>/dev/null || true",
        f"grep -c '=' {PATH}/.env 2>/dev/null || true",
        "docker ps -a --format '{{.Names}} {{.Status}}' | grep tidal || true",
        "docker ps -a --format '{{.Names}}' | grep tidal | head -1 | xargs -I{} docker inspect {} --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^TIDALDLRU_' | sed 's/=.*/=***/' || true",
    ]

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=pw, timeout=30)
    try:
        for cmd in cmds:
            print(f"+ {cmd}")
            _, stdout, _ = ssh.exec_command(cmd, timeout=60)
            print(stdout.read().decode("utf-8", "replace").strip())
            print()
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
