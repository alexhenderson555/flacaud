#!/usr/bin/env python3
import os
import sys

import paramiko

host = os.environ.get("TIDAL_HOST", "46.17.102.157")
pw = os.environ.get("TIDAL_SSH_PASSWORD", "")
track = sys.argv[1] if len(sys.argv) > 1 else "346540495"

if not pw:
    print("Set TIDAL_SSH_PASSWORD", file=sys.stderr)
    sys.exit(1)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username="root", password=pw, timeout=30)
try:
    cmds = [
        "docker logs tidal-dl-ru-api-1 --tail 80 2>&1 | grep -E '346540495|Streaming error|stream_failed|No playable|playback' | tail -20 || true",
        "docker logs tidal-dl-ru-api-1 --tail 30 2>&1 || true",
    ]
    for cmd in cmds:
        print(f"\n=== {cmd} ===")
        _, stdout, stderr = ssh.exec_command(cmd, timeout=30)
        print(stdout.read().decode(errors="replace"))
        err = stderr.read().decode(errors="replace")
        if err.strip():
            print("stderr:", err)
finally:
    ssh.close()
