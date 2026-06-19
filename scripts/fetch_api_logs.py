#!/usr/bin/env python3
"""Fetch recent API logs from production (grep stream/errors)."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = os.environ.get("TIDAL_HOST", "46.17.102.157")
USER = os.environ.get("TIDAL_SSH_USER", "root")
PATH = os.environ.get("DEPLOY_PATH", "/opt/tidal-dl-ru")
TAIL = int(os.environ.get("LOG_TAIL", "300"))


def main() -> int:
    pw = os.environ.get("TIDAL_SSH_PASSWORD")
    if not pw:
        print("Missing TIDAL_SSH_PASSWORD", file=sys.stderr)
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=pw, timeout=30)
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "--raw":
            cmd = f"cd {PATH} && docker compose logs api --tail {TAIL} 2>&1"
        else:
            cmd = (
                f"cd {PATH} && docker compose logs api --tail {TAIL} 2>&1 "
                r"| grep -iE 'stream|error|504|500|timeout|exception|bts|dash|playback|/api/stream' || true"
            )
        _, stdout, stderr = ssh.exec_command(cmd, timeout=120)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        if out:
            print(out)
        if err.strip():
            print(err, file=sys.stderr)
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
