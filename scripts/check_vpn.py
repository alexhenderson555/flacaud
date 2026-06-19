#!/usr/bin/env python3
"""Read-only Marzban health check on 151.x. Does NOT restart or change anything.

  VPN_SSH_PASSWORD=... python scripts/check_vpn.py
"""
from __future__ import annotations

import os
import sys

VPN_HOST = os.environ.get("VPN_HOST", "151.243.177.88")
VPN_USER = os.environ.get("VPN_SSH_USER", "root")

REMOTE = (
    "echo '--- marzban compose ---' && "
    "(test -d /opt/marzban && cd /opt/marzban && docker compose ps) || echo 'no /opt/marzban'; "
    "echo '--- tidal leak check ---' && "
    "(docker ps -a --format '{{.Names}}' | grep -i tidal || echo 'no tidal containers'); "
    "echo '--- marzban container ---' && "
    "docker ps --filter name=marzban --format '{{.Names}} {{.Status}}' || true"
)


def main() -> None:
    pw = os.environ.get("VPN_SSH_PASSWORD")
    if not pw:
        print("VPN_SSH_PASSWORD not set — skip remote VPN check (deploy_tidal still safe).")
        sys.exit(0)

    import paramiko

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(VPN_HOST, username=VPN_USER, password=pw, timeout=30)
    try:
        print(f"Read-only check on {VPN_HOST} (no restarts)\n")
        _, stdout, stderr = ssh.exec_command(REMOTE, timeout=120)
        code = stdout.channel.recv_exit_status()
        out = stdout.read().decode(errors="replace")
        err = stderr.read().decode(errors="replace")
        print(out)
        if err:
            print(err, file=sys.stderr)
        if code != 0:
            sys.exit(code)
        if "marzban" not in out.lower() and "Up" not in out:
            print("WARN: marzban container status unclear — review output above.", file=sys.stderr)
            sys.exit(2)
        if "tidal" in out.lower() and "no tidal" not in out.lower():
            print("WARN: tidal containers found on VPN host.", file=sys.stderr)
            sys.exit(2)
        print("VPN check OK (read-only).")
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
