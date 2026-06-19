#!/usr/bin/env python3
"""Read-only checks on production API container."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except ImportError:
    pass

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    remote_py = (
        "import os; "
        "keys=['GEMINI_API_KEY','TIDALDLRU_LYRICS','TIDALDLRU_AUDD_TOKEN']; "
        "[print(k+':', 'set len='+str(len(os.environ.get(k) or '')) if os.environ.get(k) else 'MISSING') for k in keys]"
    )
    cmd = (
        f"cd {DEPLOY_PATH} && "
        "docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T api "
        f"python -c {remote_py!r}"
    )
    code = _ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=60)
    sys.exit(code)


if __name__ == "__main__":
    main()
