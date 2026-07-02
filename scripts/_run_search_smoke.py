#!/usr/bin/env python3
from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv(ROOT / ".env")


if (ROOT / ".env.local").is_file():


    load_dotenv(ROOT / ".env.local", override=True)
from scripts.repair_servers import TIDAL_HOST, TIDAL_USER, _password, _ssh_run

code = Path(ROOT / "scripts/_search_smoke_inline.py").read_bytes()
blob = base64.b64encode(code).decode()
cmd = (
    f"cd /opt/tidal-dl-ru && docker compose exec -T api python -c "
    f"\"import base64; exec(base64.b64decode('{blob}').decode())\""
)
pw = _password("TIDAL_SSH_PASSWORD")
_ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=60)
