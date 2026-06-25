#!/usr/bin/env python3
"""One-time production cutover: SQLite → Postgres on the tidal server.

Usage (local, with TIDAL_SSH_PASSWORD + TIDAL_HOST in .env):
  python scripts/postgres_cutover_prod.py

Steps: start Postgres, alembic upgrade, copy SQLite data, flip .env, restart stack.
"""

from __future__ import annotations

import os
import secrets
import sys
import time
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env", override=True)
except ImportError:
    pass

sys.path.insert(0, str(ROOT / "scripts"))
import paramiko  # noqa: E402
from _ops_env import tidal_host  # noqa: E402

from scripts.repair_servers import compose_files  # noqa: E402

DEPLOY_PATH = os.environ.get("DEPLOY_PATH", "/opt/tidal-dl-ru").rstrip("/")
SQLITE_IN_CONTAINER = "/var/lib/tidal-dl-ru/db/flacaudio.db"


def _ssh() -> paramiko.SSHClient:
    pw = os.environ.get("TIDAL_SSH_PASSWORD")
    if not pw:
        print("Set TIDAL_SSH_PASSWORD", file=sys.stderr)
        raise SystemExit(1)
    host = tidal_host()
    user = os.environ.get("TIDAL_SSH_USER", "root")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=pw, timeout=30)
    return client


def _run(client: paramiko.SSHClient, cmd: str, *, check: bool = True) -> str:
    print("+", cmd[:200])
    _stdin, stdout, stderr = client.exec_command(cmd, timeout=600)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    if check and code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}")
    return out


def _upload_scripts(client: paramiko.SSHClient) -> None:
    """Ensure migrate script exists on server (tar may be stale)."""
    local = ROOT / "scripts" / "sqlite_to_postgres_migrate.py"
    if not local.is_file():
        return
    sftp = client.open_sftp()
    try:
        remote_dir = f"{DEPLOY_PATH}/scripts"
        try:
            sftp.stat(remote_dir)
        except OSError:
            client.exec_command(f"mkdir -p {remote_dir}")
        sftp.put(str(local), f"{remote_dir}/sqlite_to_postgres_migrate.py")
    finally:
        sftp.close()


def _env_value(client: paramiko.SSHClient, key: str) -> str:
    out = _run(
        client,
        f"cd {DEPLOY_PATH} && grep '^{key}=' .env 2>/dev/null | tail -1",
        check=False,
    ).strip()
    if "=" not in out:
        return ""
    return out.split("=", 1)[1].strip()


def main() -> int:
    client = _ssh()
    compose = compose_files()

    already = _run(
        client,
        f"cd {DEPLOY_PATH} && grep -E '^TIDAL_USE_POSTGRES=1|^DATABASE_URL=postgresql' .env 2>/dev/null || true",
        check=False,
    )
    if "postgresql" in already and "TIDAL_USE_POSTGRES=1" in already:
        print("Postgres already enabled in .env — verifying health only.")
        _run(
            client,
            f"cd {DEPLOY_PATH} && COMPOSE='{compose} -f docker-compose.postgres.yml' && $COMPOSE ps postgres 2>/dev/null || true",
            check=False,
        )
        domain = os.environ.get("DOMAIN", "flacaud.ru")
        _run(client, f"curl -sk https://{domain}/healthz | head -c 400", check=False)
        client.close()
        return 0

    pg_user = _env_value(client, "POSTGRES_USER") or os.environ.get("POSTGRES_USER", "tidal")
    pg_db = _env_value(client, "POSTGRES_DB") or os.environ.get("POSTGRES_DB", "tidaldl")
    pg_pass = _env_value(client, "POSTGRES_PASSWORD")
    if not pg_pass:
        pg_pass = secrets.token_urlsafe(24)
        _run(
            client,
            f"cd {DEPLOY_PATH} && "
            f"grep -q '^POSTGRES_PASSWORD=' .env && sed -i 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD={pg_pass}/' .env "
            f"|| echo 'POSTGRES_PASSWORD={pg_pass}' >> .env",
        )
    _run(
        client,
        f"cd {DEPLOY_PATH} && "
        f"grep -q '^POSTGRES_USER=' .env || echo 'POSTGRES_USER={pg_user}' >> .env && "
        f"grep -q '^POSTGRES_DB=' .env || echo 'POSTGRES_DB={pg_db}' >> .env",
    )

    # Failed prior attempts may leave a pg volume with a different password — reset before init.
    _run(
        client,
        f"cd {DEPLOY_PATH} && COMPOSE='{compose} -f docker-compose.postgres.yml' && "
        f"$COMPOSE stop postgres 2>/dev/null; $COMPOSE rm -sf postgres 2>/dev/null; true",
        check=False,
    )
    _run(client, "docker volume rm -f tidal-dl-ru_pg-data 2>/dev/null || true", check=False)

    db_url = (
        f"postgresql+psycopg://{quote_plus(pg_user)}:{quote_plus(pg_pass)}"
        f"@postgres:5432/{quote_plus(pg_db)}"
    )

    _run(
        client,
        f"cd {DEPLOY_PATH} && COMPOSE='{compose} -f docker-compose.postgres.yml' && "
        f"$COMPOSE up -d --force-recreate postgres",
    )
    for _ in range(30):
        health = _run(
            client,
            f"cd {DEPLOY_PATH} && COMPOSE='{compose} -f docker-compose.postgres.yml' && $COMPOSE exec -T postgres pg_isready -U {pg_user} -d {pg_db}",
            check=False,
        )
        if "accepting connections" in health:
            break
        time.sleep(2)
    else:
        raise RuntimeError("Postgres did not become ready")

    _upload_scripts(client)

    _run(
        client,
        f"cd {DEPLOY_PATH} && COMPOSE='{compose} -f docker-compose.postgres.yml' && "
        f"$COMPOSE run --rm -e DATABASE_URL='{db_url}' api "
        f"python -c \"from tidal_dl_ru.database.database import create_db_and_tables; create_db_and_tables()\"",
    )

    _run(
        client,
        f"cd {DEPLOY_PATH} && COMPOSE='{compose} -f docker-compose.postgres.yml' && "
        f"$COMPOSE run --rm -e DATABASE_URL='{db_url}' "
        f"-v {DEPLOY_PATH}/scripts:/app/scripts:ro "
        f"api python /app/scripts/sqlite_to_postgres_migrate.py --sqlite {SQLITE_IN_CONTAINER} --postgres-url '{db_url}'",
    )

    _run(
        client,
        f"cd {DEPLOY_PATH} && "
        f"grep -q '^TIDAL_USE_POSTGRES=' .env && sed -i 's/^TIDAL_USE_POSTGRES=.*/TIDAL_USE_POSTGRES=1/' .env || echo 'TIDAL_USE_POSTGRES=1' >> .env && "
        f"grep -q '^DATABASE_URL=' .env && sed -i 's|^DATABASE_URL=.*|DATABASE_URL={db_url}|' .env || echo 'DATABASE_URL={db_url}' >> .env",
    )

    _run(client, f"cd {DEPLOY_PATH} && COMPOSE='{compose} -f docker-compose.postgres.yml' && $COMPOSE up -d --force-recreate api worker bot")
    time.sleep(8)
    domain = os.environ.get("DOMAIN", "flacaud.ru")
    _run(client, f"curl -sk https://{domain}/healthz | head -c 400")

    print("Postgres cutover complete.")
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
