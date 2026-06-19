#!/usr/bin/env python3
"""One-off: set Spotify API keys on production and recreate api/worker."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env", override=True)

from scripts.repair_servers import (  # noqa: E402
    COMPOSE_FILES,
    DEPLOY_PATH,
    TIDAL_HOST,
    TIDAL_USER,
    TRANSFER_ENV_KEYS,
    _password,
    _remote_env_upserts,
    _ssh_run,
)


def main() -> int:
    pw = _password("TIDAL_SSH_PASSWORD")
    if not pw:
        print("TIDAL_SSH_PASSWORD not set — keys saved locally in .env only.")
        return 2

    upsert = _remote_env_upserts(TRANSFER_ENV_KEYS)
    if not upsert:
        print("SPOTIPY_CLIENT_ID / SPOTIPY_CLIENT_SECRET missing in local .env")
        return 1

    patch_compose = (
        "if ! grep -q SPOTIPY_CLIENT_ID docker-compose.yml; then "
        "python3 - <<'PY'\n"
        "from pathlib import Path\n"
        "p = Path('docker-compose.yml')\n"
        "t = p.read_text()\n"
        "needle = '      TIDALDLRU_SMTP_TLS: ${TIDALDLRU_SMTP_TLS:-true}'\n"
        "insert = needle + '\\n      SPOTIPY_CLIENT_ID: ${SPOTIPY_CLIENT_ID:-}\\n      SPOTIPY_CLIENT_SECRET: ${SPOTIPY_CLIENT_SECRET:-}'\n"
        "if needle in t and 'SPOTIPY_CLIENT_ID' not in t:\n"
        "    p.write_text(t.replace(needle, insert, 1))\n"
        "needle2 = '      TIDALDLRU_DEEPL_KEY: ${TIDALDLRU_DEEPL_KEY:-}'\n"
        "insert2 = needle2 + '\\n      SPOTIPY_CLIENT_ID: ${SPOTIPY_CLIENT_ID:-}\\n      SPOTIPY_CLIENT_SECRET: ${SPOTIPY_CLIENT_SECRET:-}'\n"
        "t = p.read_text()\n"
        "if needle2 in t and t.count('SPOTIPY_CLIENT_ID') < 2:\n"
        "    p.write_text(t.replace(needle2, insert2, 1))\n"
        "PY\n"
        "fi"
    )

    cmd = (
        f"cd {DEPLOY_PATH} && touch .env && {upsert}"
        f"{patch_compose} && "
        f"{COMPOSE_FILES} up -d --force-recreate api worker"
    )
    return _ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=300)


if __name__ == "__main__":
    raise SystemExit(main())
