#!/usr/bin/env python3
"""Quick prod repair: inspect containers and restart API stack."""
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


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 300) -> tuple[int, str, str]:
    print(f"\n+ {cmd}\n")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    if out:
        print(out[-12000:] if len(out) > 12000 else out)
    if err.strip():
        print(err[-4000:], file=sys.stderr)
    return code, out, err


def main() -> int:
    pw = os.environ.get("TIDAL_SSH_PASSWORD")
    if not pw:
        print("Missing TIDAL_SSH_PASSWORD", file=sys.stderr)
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=pw, timeout=30)
    try:
        run(ssh, f"cd {PATH} && docker compose ps -a")
        run(ssh, f"cd {PATH} && docker compose logs api --tail 80 2>&1")
        run(
            ssh,
            f"cd {PATH} && docker compose exec -T api curl -s -o /dev/null -w 'api_in:%{{http_code}}\\n' "
            "http://127.0.0.1:8000/api/healthz || true",
        )

        restart = os.environ.get("REPAIR_RESTART", "1").strip().lower() not in ("0", "false", "no")
        if restart:
            code, _, _ = run(
                ssh,
                f"cd {PATH} && COMPOSE='docker compose -f docker-compose.yml -f docker-compose.prod.yml' "
                f"&& $COMPOSE up -d --remove-orphans api worker bot caddy && $COMPOSE restart api caddy",
                timeout=600,
            )
            if code != 0:
                return code
            run(ssh, f"cd {PATH} && docker compose ps -a")
            run(ssh, f"sleep 8 && curl -s -o /dev/null -w 'caddy:%{{http_code}}\\n' https://{os.environ.get('DOMAIN', 'flacaud.ru')}/healthz -k || true")
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
