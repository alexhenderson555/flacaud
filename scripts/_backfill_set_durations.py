#!/usr/bin/env python3
"""One-off backfill: recompute SavedSet.duration_seconds for existing rows using
the fixed sum_track_durations (which now also reads matched_track.duration_s),
so already-saved sets show the right duration without needing a re-save."""
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
    "from tidal_dl_ru.database.database import engine; "
    "from tidal_dl_ru.database.models import SavedSet; "
    "from tidal_dl_ru.server.share_utils import parse_tracks_json, sum_track_durations; "
    "from sqlmodel import Session, select; "
    "s = Session(engine); "
    "rows = s.exec(select(SavedSet)).all(); "
    "changed = 0; "
    "\n"
    "for r in rows:\n"
    "    tracks = parse_tracks_json(r.tracks_json)\n"
    "    new_dur = sum_track_durations(tracks)\n"
    "    if new_dur and new_dur != r.duration_seconds:\n"
    "        print('id=%s %s -> %s' % (r.id, r.duration_seconds, new_dur))\n"
    "        r.duration_seconds = new_dur\n"
    "        s.add(r)\n"
    "        changed += 1\n"
    "s.commit()\n"
    "print('updated', changed, 'of', len(rows), 'rows')"
)


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    remote = (
        f"cd {DEPLOY_PATH} && "
        f"COMPOSE='{compose_files()}' && "
        f'$COMPOSE exec -T api python -c "{QUERY}"'
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=120)


if __name__ == "__main__":
    main()
