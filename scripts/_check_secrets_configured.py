#!/usr/bin/env python3
"""Check whether TIDALDLRU_JWT_SECRET / TIDALDLRU_SIGNING_SECRET are actually
set in production (not just missing in local dev) - an ephemeral fallback
secret invalidates every JWT/signed URL on every container restart, which
would be a real problem given how many restarts happen per deploy."""
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
    "import os\n"
    "for k in ('TIDALDLRU_JWT_SECRET', 'TIDALDLRU_SIGNING_SECRET'):\n"
    "    v = os.environ.get(k)\n"
    "    print(k, '=', ('SET (len=%d)' % len(v)) if v else 'MISSING (ephemeral fallback in use)')\n"
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
