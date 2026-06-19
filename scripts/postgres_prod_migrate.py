#!/usr/bin/env python3
"""Switch production stack from SQLite to Postgres (one-time ops).

Run on the server after setting POSTGRES_PASSWORD in .env:

  docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d postgres
  # wait for healthy, then:
  python scripts/postgres_prod_migrate.py --stamp

For a fresh Postgres with schema only (no SQLite data copy):

  python scripts/postgres_prod_migrate.py --alembic-upgrade

SQLite → Postgres data migration is manual (pgloader or custom export); this script
only brings Postgres online and runs Alembic.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _run(cmd: list[str], *, env: dict | None = None) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, env=env or os.environ, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Postgres prod migration helper")
    parser.add_argument("--alembic-upgrade", action="store_true", help="Run alembic upgrade head on DATABASE_URL")
    parser.add_argument("--stamp", action="store_true", help="Stamp alembic to head after create_all")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url.startswith("postgresql"):
        print("Set DATABASE_URL=postgresql+psycopg://... before running.", file=sys.stderr)
        return 1

    if args.alembic_upgrade:
        _run([sys.executable, "-m", "alembic", "upgrade", "head"])
        print("Alembic upgrade complete.")
        return 0

    if args.stamp:
        _run([sys.executable, "-m", "alembic", "stamp", "head"])
        print("Alembic stamped to head.")
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
