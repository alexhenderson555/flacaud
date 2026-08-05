#!/usr/bin/env python3
"""Verify the 006_processed_payments migration actually applied in prod —
alembic_version at head + the processedpayment table exists."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env", override=True)
    if (ROOT / ".env.local").is_file():
        load_dotenv(ROOT / ".env.local", override=True)
except ImportError:
    pass

sys.path.insert(0, str(ROOT / "scripts"))
from _ops_env import tidal_host  # noqa: E402

os.environ.setdefault("TIDAL_HOST", os.environ.get("DEPLOY_HOST") or tidal_host(required=False) or "")

from scripts.repair_servers import (  # noqa: E402
    DEPLOY_PATH,
    TIDAL_HOST,
    TIDAL_USER,
    _password,
    _ssh_run,
    compose_files,
)

QUERY = (
    "from sqlalchemy import inspect, text\n"
    "from tidal_dl_ru.database import database as db_mod\n"
    "with db_mod.engine.connect() as conn:\n"
    "    row = conn.execute(text('SELECT version_num FROM alembic_version')).scalar()\n"
    "    print('alembic_version =', row)\n"
    "    tables = set(inspect(conn).get_table_names())\n"
    "    print('processedpayment table present =', 'processedpayment' in tables)\n"
)


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    remote = (
        f"cd {DEPLOY_PATH} && "
        f"COMPOSE='{compose_files()}' && "
        f'$COMPOSE exec -T api python -c "{QUERY}"'
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=60)


if __name__ == "__main__":
    main()
