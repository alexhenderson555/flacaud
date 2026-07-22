#!/usr/bin/env python3
"""One-off diagnostic: dump SavedSet rows (title/track_count/duration/tracks_json
length) from the production DB, read-only, via SSH + docker compose exec."""
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

from scripts.repair_servers import TIDAL_HOST, TIDAL_USER, _ssh_run, _password, compose_files, DEPLOY_PATH  # noqa: E402

QUERY = (
    "from tidal_dl_ru.database.database import engine; "
    "from tidal_dl_ru.database.models import SavedSet; "
    "from sqlmodel import Session, select; "
    "import json; "
    "s = Session(engine); "
    "rows = s.exec(select(SavedSet)).all(); "
    "[print(r.id, r.user_id, repr(r.title)[:50], r.url[:70], "
    "'track_count=%s' % r.track_count, 'duration_seconds=%s' % r.duration_seconds, "
    "'tracks_json_len=%s' % (len(json.loads(r.tracks_json or '[]'))), "
    "'updated_at=%s' % r.updated_at) for r in rows]"
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
