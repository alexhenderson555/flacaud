#!/usr/bin/env python3
"""Find and remove stream-cache casualties of the disk-full incident: a
leftover .merge.lock file next to its final output file means that merge
was interrupted mid-write (disk full) and never cleaned up its lock, and the
final file is very likely truncated. Delete both so the next playback
request re-fetches/re-merges cleanly. Also removes bare .lock/.part files
with no companion (same interrupted-write signature)."""
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

DRY_RUN = "--apply" not in sys.argv

QUERY = (
    "from tidal_dl_ru.server.settings import settings\n"
    "import os\n"
    f"dry_run = {DRY_RUN}\n"
    "cache_dir = settings.stream_cache_dir\n"
    "lock_files = []\n"
    "for root, dirs, files in os.walk(cache_dir):\n"
    "    for f in files:\n"
    "        if f.endswith('.lock') or f.endswith('.part'):\n"
    "            lock_files.append(os.path.join(root, f))\n"
    "print('found %d stale lock/part markers' % len(lock_files))\n"
    "removed = 0\n"
    "freed = 0\n"
    "for lock_path in lock_files:\n"
    "    base = lock_path\n"
    "    for suffix in ('.merge.lock', '.lock', '.part'):\n"
    "        if base.endswith(suffix):\n"
    "            base = base[: -len(suffix)]\n"
    "            break\n"
    "    companions = []\n"
    "    d = os.path.dirname(base) or '.'\n"
    "    prefix = os.path.basename(base)\n"
    "    try:\n"
    "        for f in os.listdir(d):\n"
    "            if f.startswith(prefix) and f != os.path.basename(lock_path):\n"
    "                companions.append(os.path.join(d, f))\n"
    "    except OSError:\n"
    "        pass\n"
    "    sizes = []\n"
    "    for c in companions:\n"
    "        try:\n"
    "            sizes.append((c, os.path.getsize(c)))\n"
    "        except OSError:\n"
    "            pass\n"
    "    print('LOCK:', lock_path)\n"
    "    for c, sz in sizes:\n"
    "        print('  companion:', c, 'size=%.2f MB' % (sz / 1_048_576))\n"
    "    if not dry_run:\n"
    "        try:\n"
    "            os.remove(lock_path)\n"
    "            removed += 1\n"
    "        except OSError as e:\n"
    "            print('  failed to remove lock:', e)\n"
    "        for c, sz in sizes:\n"
    "            try:\n"
    "                os.remove(c)\n"
    "                removed += 1\n"
    "                freed += sz\n"
    "            except OSError as e:\n"
    "                print('  failed to remove companion:', e)\n"
    "print('dry_run=%s removed=%d freed_mb=%.2f' % (dry_run, removed, freed / 1_048_576))\n"
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
