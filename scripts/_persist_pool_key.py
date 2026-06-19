#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

KEY = "xX8x5rRjw7qefQv2auRZsmDE-w5ovRlFVKC8a3wh-MM="
cmd = (
    f"cd {DEPLOY_PATH} && "
    f"if grep -q '^TIDALDLRU_POOL_KEY=' .env 2>/dev/null; then "
    f"sed -i 's|^TIDALDLRU_POOL_KEY=.*|TIDALDLRU_POOL_KEY={KEY}|' .env; "
    f"else echo 'TIDALDLRU_POOL_KEY={KEY}' >> .env; fi && "
    f"docker compose up -d api worker"
)
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=180))
