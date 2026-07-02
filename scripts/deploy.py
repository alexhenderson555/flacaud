#!/usr/bin/env python3
"""Deploy tidal-dl-ru to a remote host via SSH (no secrets in repo).

Required environment:
  DEPLOY_HOST          e.g. 46.17.102.157
  DEPLOY_USER          e.g. root
  DEPLOY_PATH          remote dir (default /opt/tidal-dl-ru)

Auth (pick one):
  DEPLOY_SSH_KEY       path to private key
  DEPLOY_PASSWORD      password (discouraged; use SSH keys)

Optional:
  DEPLOY_SKIP_BUILD=1  skip local frontend build
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")

    if (ROOT / ".env.local").is_file():

        load_dotenv(ROOT / ".env.local", override=True)
except ImportError:
    pass


def _require(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        print(f"Missing env: {name}", file=sys.stderr)
        sys.exit(1)
    return val


def _ssh_base() -> list[str]:
    host = _require("DEPLOY_HOST")
    user = _require("DEPLOY_USER")
    cmd = ["ssh", "-o", "StrictHostKeyChecking=accept-new"]
    key = os.environ.get("DEPLOY_SSH_KEY")
    if key:
        cmd.extend(["-i", key])
    cmd.append(f"{user}@{host}")
    return cmd


def _scp_base() -> list[str]:
    _require("DEPLOY_HOST")
    _require("DEPLOY_USER")
    cmd = ["scp", "-o", "StrictHostKeyChecking=accept-new"]
    key = os.environ.get("DEPLOY_SSH_KEY")
    if key:
        cmd.extend(["-i", key])
    return cmd


def run(cmd: list[str], *, cwd: Path | None = None) -> None:
    print("+", " ".join(cmd))
    kwargs: dict = {"cwd": cwd, "check": True}
    if sys.platform == "win32" and cmd and cmd[0] in ("npm", "npx"):
        kwargs["shell"] = True
    subprocess.run(cmd, **kwargs)


def main() -> None:
    password = os.environ.get("DEPLOY_PASSWORD")
    if password:
        _deploy_paramiko(password)
        return

    if not shutil.which("ssh") or not shutil.which("scp"):
        print("OpenSSH client (ssh/scp) required.", file=sys.stderr)
        sys.exit(1)

    deploy_path = os.environ.get("DEPLOY_PATH", "/opt/tidal-dl-ru")

    if not os.environ.get("DEPLOY_SKIP_BUILD"):
        if shutil.which("npm"):
            run(["npm", "run", "build"], cwd=ROOT / "frontend")
        else:
            print("npm not found — using existing frontend/dist")

    run([sys.executable, str(ROOT / "make_tar.py")], cwd=ROOT)

    scp = _scp_base()
    tar = ROOT / "app.tar.gz"
    host = os.environ["DEPLOY_HOST"]
    user = os.environ["DEPLOY_USER"]
    remote_tar = f"{user}@{host}:{deploy_path}/app.tar.gz"
    run(scp + [str(tar), remote_tar])

    remote_cmd = (
        f"mkdir -p {deploy_path} && cd {deploy_path} && "
        "tar -xzf app.tar.gz && "
        "docker compose build api worker bot && "
        "docker compose up -d --remove-orphans"
    )
    run(_ssh_base() + [remote_cmd])

    print("Deploy complete.")


def _deploy_paramiko(password: str) -> None:
    """Fallback when SSH keys are not configured (password via env only)."""
    try:
        import paramiko
        from scp import SCPClient
    except ImportError as e:
        print("Install paramiko+scp for password deploy: uv pip install paramiko scp", file=sys.stderr)
        raise SystemExit(1) from e

    host = _require("DEPLOY_HOST")
    user = _require("DEPLOY_USER")
    deploy_path = os.environ.get("DEPLOY_PATH", "/opt/tidal-dl-ru")

    if not os.environ.get("DEPLOY_SKIP_BUILD") and shutil.which("npm"):
        run(["npm", "run", "build"], cwd=ROOT / "frontend")
    run([sys.executable, str(ROOT / "make_tar.py")], cwd=ROOT)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password, timeout=30)
    with SCPClient(ssh.get_transport()) as scp:
        ssh.exec_command(f"mkdir -p {deploy_path}")
        scp.put(str(ROOT / "app.tar.gz"), remote_path=f"{deploy_path}/")
    cmd = (
        f"cd {deploy_path} && tar -xzf app.tar.gz && "
        "docker compose build api worker bot && docker compose up -d --remove-orphans"
    )
    _, stdout, stderr = ssh.exec_command(cmd, timeout=3600)
    exit_status = stdout.channel.recv_exit_status()
    for line in stdout:
        print(line, end="")
    err = stderr.read().decode()
    if err:
        print(err, file=sys.stderr)
    ssh.close()
    if exit_status != 0:
        raise SystemExit(f"Remote deploy failed with exit code {exit_status}")
    print("Deploy complete.")


if __name__ == "__main__":
    main()
