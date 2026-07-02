#!/usr/bin/env python3
"""Run ops/server-maintenance.sh on the tidal host (46.17.102.157). Never touches VPN 151."""
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

from scripts.repair_servers import (  # noqa: E402
    DEPLOY_PATH,
    TIDAL_HOST,
    TIDAL_USER,
    _password,
    _ssh_run,
)


def _upload_maintenance_script(pw: str) -> None:
    import paramiko
    from scp import SCPClient

    local = ROOT / "ops" / "server-maintenance.sh"
    if not local.is_file():
        raise SystemExit(f"Missing {local}")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)
    try:
        ssh.exec_command(f"mkdir -p {DEPLOY_PATH}/ops", timeout=30)
        with SCPClient(ssh.get_transport()) as scp:
            scp.put(str(local), remote_path=f"{DEPLOY_PATH}/ops/server-maintenance.sh")
        _ssh_run(TIDAL_HOST, TIDAL_USER, pw, f"chmod +x {DEPLOY_PATH}/ops/server-maintenance.sh", timeout=30)
    finally:
        ssh.close()


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    _upload_maintenance_script(pw)
    retention = os.environ.get("JOBS_RETENTION_DAYS", "14")
    keep_gb = os.environ.get("BUILDER_KEEP_GB", "3")
    remote = (
        f"cd {DEPLOY_PATH} && "
        f"JOBS_RETENTION_DAYS={retention} BUILDER_KEEP_GB={keep_gb} "
        "bash ops/server-maintenance.sh"
    )
    print(f"Optimizing tidal host {TIDAL_HOST} …")
    code = _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=600)
    if code != 0:
        raise SystemExit(f"Maintenance failed with exit {code}")
    print("Done.")


if __name__ == "__main__":
    main()
