#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv(ROOT / ".env")
from scripts.repair_servers import (  # noqa: E402
    COMPOSE_FILES,
    DEPLOY_PATH,
    TIDAL_HOST,
    TIDAL_USER,
    _password,
    _ssh_run,
)

cmd = (
    f"cd {DEPLOY_PATH} && "
    f"{COMPOSE_FILES} ps && "
    f"{COMPOSE_FILES} logs api --tail 30 && "
    f"curl -s -o /dev/null -w 'local_health:%{{http_code}}\\n' http://127.0.0.1:8001/healthz || true"
)
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=120))
