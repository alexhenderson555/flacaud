#!/usr/bin/env python3
"""Bring production stack up with Postgres overlay."""

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.postgres_cutover_prod import DEPLOY_PATH, _run, _ssh


def main() -> int:
    client = _ssh()
    compose = (
        "docker compose -f docker-compose.yml -f docker-compose.prod.yml "
        "-f docker-compose.observability.yml -f docker-compose.postgres.yml"
    )
    _run(client, f"cd {DEPLOY_PATH} && COMPOSE='{compose}' && $COMPOSE up -d")
    time.sleep(10)
    _run(client, "curl -sk https://flacaud.ru/healthz | head -c 300", check=False)
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
