#!/usr/bin/env python3
"""One-off backfill: fetch the real title (via yt-dlp metadata, same as
fetch_set_info) for existing SavedSet rows still stuck on the generic
"YouTube set"/"SoundCloud set" placeholder from before the add-flow title fix."""
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
    "from tidal_dl_ru.core.set_search import fetch_set_info; "
    "from sqlmodel import Session, select; "
    "s = Session(engine); "
    "rows = s.exec(select(SavedSet)).all(); "
    "placeholders = {'youtube set', 'soundcloud set'}; "
    "changed = 0; "
    "\n"
    "for r in rows:\n"
    "    if (r.title or '').strip().lower() not in placeholders:\n"
    "        continue\n"
    "    try:\n"
    "        info = fetch_set_info(r.url)\n"
    "    except Exception as e:\n"
    "        print('id=%s FAILED: %s' % (r.id, e))\n"
    "        continue\n"
    "    title = (info.get('title') or '').strip()\n"
    "    if not title:\n"
    "        print('id=%s no title returned' % r.id)\n"
    "        continue\n"
    "    print('id=%s %r -> %r' % (r.id, r.title, title))\n"
    "    r.title = title[:512]\n"
    "    s.add(r)\n"
    "    changed += 1\n"
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
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=180)


if __name__ == "__main__":
    main()
