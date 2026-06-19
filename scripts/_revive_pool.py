#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

cmd = (
    f"cd {DEPLOY_PATH} && docker compose exec -T api python -c "
    "'from tidal_dl_ru.providers.tidal import pool as p; "
    "print(\"revive\", p.revive(1), p.revive(2)); "
    "print(\"reset\", p.reset_daily_quotas())'"
)
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=60))
