#!/usr/bin/env python3
"""Generate activation codes on production API container."""
from __future__ import annotations

import argparse
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

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate activation codes on prod")
    parser.add_argument("plans", nargs="*", default=["pro"], help="basic, pro, lifetime")
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--note", default="manual QA")
    args = parser.parse_args()

    plans = args.plans or ["pro"]
    remote_py = (
        "from tidal_dl_ru.server.activation_codes import generate_code; "
        f"plans={plans!r}; note={args.note!r}; valid_days={args.days}; "
        "[print(f'{p}: ' + generate_code(plan=p, valid_days=valid_days, note=note)) for p in plans]"
    )
    cmd = (
        f"cd {DEPLOY_PATH} && "
        "docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T api "
        f"python -c {remote_py!r}"
    )
    pw = _password("TIDAL_SSH_PASSWORD")
    code = _ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=120)
    sys.exit(code)


if __name__ == "__main__":
    main()
