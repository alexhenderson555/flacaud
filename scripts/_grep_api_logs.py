#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

pattern = sys.argv[1] if len(sys.argv) > 1 else "429"
since = sys.argv[2] if len(sys.argv) > 2 else "2h"
cmd = (
    f"cd {DEPLOY_PATH} && docker compose logs api --since={since} 2>&1 "
    f"| grep -i {pattern} | tail -30"
)
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=60))
