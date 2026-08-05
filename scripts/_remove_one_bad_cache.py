#!/usr/bin/env python3
"""Remove the confirmed-truncated cache file for one specific track
(5.85MB HI_RES_LOSSLESS FLAC is implausibly small for a multi-minute track -
confirmed via the reported 416 Range Not Satisfiable + can't-seek-earlier
symptom) so the next playback request re-downloads it cleanly."""
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

TRACK_ID = "366185225"
QUERY = (
    "from tidal_dl_ru.server.settings import settings\n"
    "import os\n"
    f"track_id = '{TRACK_ID}'\n"
    "cache_dir = settings.stream_cache_dir\n"
    "removed = []\n"
    "for f in os.listdir(cache_dir):\n"
    "    if track_id in f:\n"
    "        p = os.path.join(cache_dir, f)\n"
    "        try:\n"
    "            os.remove(p)\n"
    "            removed.append(p)\n"
    "        except OSError as e:\n"
    "            print('failed:', p, e)\n"
    "print('removed:', removed)\n"
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
