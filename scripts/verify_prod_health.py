#!/usr/bin/env python3
"""Quick prod health check via SSH (from server itself)."""
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

sys.path.insert(0, str(ROOT / "scripts"))
from _ops_env import tidal_host  # noqa: E402

HOST = tidal_host()
USER = os.environ.get("TIDAL_SSH_USER", "root")
DOMAIN = os.environ.get("DOMAIN", os.environ.get("DEPLOY_DOMAIN", "flacaud.ru")).strip() or "flacaud.ru"


def main() -> int:
    pw = os.environ.get("TIDAL_SSH_PASSWORD")
    if not pw:
        print("Missing TIDAL_SSH_PASSWORD", file=sys.stderr)
        return 1

    base = f"https://{DOMAIN}"
    cmds = [
        f"curl -sk -o /dev/null -w 'https_healthz:%{{http_code}}\\n' {base}/healthz",
        f"curl -sk {base}/healthz | head -c 300",
        f"curl -sk -o /dev/null -w 'providers:%{{http_code}}\\n' {base}/api/providers",
    ]
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=pw, timeout=30)
    try:
        for cmd in cmds:
            print(f"+ {cmd}")
            _, stdout, stderr = ssh.exec_command(cmd, timeout=30)
            code = stdout.channel.recv_exit_status()
            out = stdout.read().decode("utf-8", "replace").strip()
            err = stderr.read().decode("utf-8", "replace").strip()
            if out:
                print(out)
            if err:
                print(err, file=sys.stderr)
            if code != 0:
                print(f"exit {code}", file=sys.stderr)
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
