#!/usr/bin/env python3
"""Align production: tidal-dl-ru on 46.x, Marzban VPN on 151.x.

Requires env (never commit passwords):
  TIDAL_SSH_PASSWORD   — root@46.17.102.157
  VPN_SSH_PASSWORD     — root@151.243.177.88

Optional:
  TIDAL_HOST=46.17.102.157
  VPN_HOST=151.243.177.88
  SKIP_TIDAL_DEPLOY=1
  VPN_FIX=1              # ONLY when explicitly fixing VPN — never during normal deploy
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TIDAL_HOST = os.environ.get("TIDAL_HOST", "46.17.102.157")
VPN_HOST = os.environ.get("VPN_HOST", "151.243.177.88")
TIDAL_USER = os.environ.get("TIDAL_SSH_USER", "root")
VPN_USER = os.environ.get("VPN_SSH_USER", "root")
DEPLOY_PATH = os.environ.get("DEPLOY_PATH", "/opt/tidal-dl-ru")


def _password(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        print(f"Missing env: {name}", file=sys.stderr)
        sys.exit(1)
    return val


def _ssh_run(host: str, user: str, password: str, command: str, *, timeout: int = 3600) -> int:
    import paramiko

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password, timeout=30)
    try:
        print(f"\n=== {host} ===\n+ {command}\n")
        _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
        exit_status = stdout.channel.recv_exit_status()
        out = stdout.read().decode(errors="replace")
        err = stderr.read().decode(errors="replace")
        if out:
            print(out[-8000:] if len(out) > 8000 else out)
        if err:
            print(err[-4000:] if len(err) > 4000 else err, file=sys.stderr)
        return exit_status
    finally:
        ssh.close()


def _scp_tar(host: str, user: str, password: str, local_tar: Path) -> None:
    import paramiko
    from scp import SCPClient

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password, timeout=30)
    try:
        with SCPClient(ssh.get_transport()) as scp:
            scp.put(str(local_tar), remote_path=f"{DEPLOY_PATH}/app.tar.gz")
    finally:
        ssh.close()


def fix_vpn_server() -> None:
    if not os.environ.get("VPN_FIX"):
        print("VPN host untouched (set VPN_FIX=1 only for manual Marzban maintenance)")
        return
    pw = _password("VPN_SSH_PASSWORD")
    # Remove mistaken tidal stack from VPN host
    _ssh_run(
        VPN_HOST,
        VPN_USER,
        pw,
        f"test -d {DEPLOY_PATH} && (cd {DEPLOY_PATH} && docker compose down -v) || true; "
        "docker rm -f $(docker ps -aq --filter 'name=tidal-dl-ru') 2>/dev/null || true",
        timeout=600,
    )
    code = _ssh_run(
        VPN_HOST,
        VPN_USER,
        pw,
        "test -d /opt/marzban && cd /opt/marzban && docker compose restart marzban || docker compose up -d",
        timeout=600,
    )
    if code != 0:
        print(f"VPN marzban restart exit {code}", file=sys.stderr)


def deploy_tidal_server() -> None:
    if os.environ.get("SKIP_TIDAL_DEPLOY"):
        print("SKIP_TIDAL_DEPLOY set — skipping tidal deploy")
        return
    pw = _password("TIDAL_SSH_PASSWORD")
    if not os.environ.get("DEPLOY_SKIP_BUILD"):
        subprocess.run(["npm", "run", "build"], cwd=ROOT / "frontend", check=True, shell=sys.platform == "win32")
    subprocess.run([sys.executable, str(ROOT / "make_tar.py")], cwd=ROOT, check=True)
    tar = ROOT / "app.tar.gz"
    if not tar.is_file():
        raise SystemExit("app.tar.gz missing after make_tar.py")

    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, f"mkdir -p {DEPLOY_PATH}", timeout=60)
    _scp_tar(TIDAL_HOST, TIDAL_USER, pw, tar)

    public_base = os.environ.get("TIDALDLRU_PUBLIC_API_BASE", f"http://{TIDAL_HOST}")
    domain = os.environ.get("DEPLOY_DOMAIN", "proshli.ru")
    acme_email = os.environ.get("ACME_EMAIL", f"admin@{domain}")
    remote = (
        f"cd {DEPLOY_PATH} && tar -xzf app.tar.gz && "
        "touch .env && "
        f"(grep -q '^TIDALDLRU_PUBLIC_API_BASE=' .env && "
        f"sed -i 's|^TIDALDLRU_PUBLIC_API_BASE=.*|TIDALDLRU_PUBLIC_API_BASE={public_base}|' .env || "
        f"echo 'TIDALDLRU_PUBLIC_API_BASE={public_base}' >> .env) && "
        f"(grep -q '^DOMAIN=' .env && sed -i 's|^DOMAIN=.*|DOMAIN={domain}|' .env || echo 'DOMAIN={domain}' >> .env) && "
        f"(grep -q '^ACME_EMAIL=' .env || echo 'ACME_EMAIL={acme_email}' >> .env) && "
        "(grep -q '^API_PORT=' .env && sed -i 's|^API_PORT=.*|API_PORT=8001|' .env || echo 'API_PORT=8001' >> .env) && "
        "COMPOSE='docker compose -f docker-compose.yml -f docker-compose.prod.yml' && "
        "$COMPOSE build api worker bot && "
        "$COMPOSE up -d --remove-orphans && "
        "bash ops/prune-frontend-dist.sh frontend/dist 2>/dev/null || true && "
        "$COMPOSE up -d caddy && $COMPOSE restart caddy api bot"
    )
    code = _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=3600)
    if code != 0:
        raise SystemExit(f"Tidal deploy failed with exit {code}")


def smoke_tidal() -> None:
    import urllib.request

    url = f"http://{TIDAL_HOST}/api/providers"
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            print(f"Smoke {url} -> {resp.status}")
    except Exception as e:
        print(f"Smoke failed: {e}", file=sys.stderr)


def main() -> None:
    fix_vpn_server()
    deploy_tidal_server()
    smoke_tidal()
    print("\nDone. Tidal:", TIDAL_HOST, "| VPN (Marzban):", VPN_HOST)


if __name__ == "__main__":
    main()
