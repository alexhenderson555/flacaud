#!/usr/bin/env python3
"""Corrected full scan for truncated stream-cache casualties.

The earlier sweep matched companions by naive string-prefix on the lock's
own stripped name, which only works when the final file shares the lock's
extension (true for *_HIGH.m4a.merge.lock -> *_HIGH.m4a) but NOT for DASH/
lossless entries (*_HI_RES_LOSSLESS.fmp4.merge.lock -> the final output is
*_HI_RES_LOSSLESS.flac or .m4a, a different extension entirely) - so every
lossless entry's companion was silently missed. This version matches by
track_id + quality prefix instead, across any extension, and flags files
that are implausibly small for their quality tier.
"""
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

QUERY = r"""
from tidal_dl_ru.server.settings import settings
import os, re

cache_dir = settings.stream_cache_dir
all_files = os.listdir(cache_dir)

# group every file by its track_id + QUALITY prefix, across all extensions
groups = {}
pat = re.compile(r'^(\d+_[A-Z_]+?)(\.[a-z0-9]+(?:\.[a-z]+)*)$')
for f in all_files:
    m = pat.match(f)
    if not m:
        continue
    prefix = m.group(1)
    groups.setdefault(prefix, []).append(f)

# min plausible bytes/track heuristics (very conservative floors)
MIN_BYTES = {
    'HI_RES_LOSSLESS': 3_000_000,
    'LOSSLESS': 3_000_000,
    'HIGH': 1_000_000,
    'LOW': 300_000,
}

suspicious = []
for prefix, files in sorted(groups.items()):
    quality = None
    for q in MIN_BYTES:
        if prefix.endswith('_' + q):
            quality = q
            break
    data_files = [f for f in files if not (f.endswith('.lock') or f.endswith('.part') or f.endswith('.meta'))]
    if not data_files:
        continue
    sizes = []
    for f in data_files:
        p = os.path.join(cache_dir, f)
        try:
            sizes.append((f, os.path.getsize(p)))
        except OSError:
            pass
    if not sizes:
        continue
    total = sum(sz for _, sz in sizes)
    floor = MIN_BYTES.get(quality, 500_000)
    if total < floor:
        suspicious.append((prefix, quality, sizes, total, floor))

print('scanned %d prefix-groups, %d files total' % (len(groups), len(all_files)))
print('suspicious (below plausible floor for their quality):')
for prefix, quality, sizes, total, floor in suspicious:
    print(' %s quality=%s total=%.2fMB floor=%.2fMB' % (prefix, quality, total / 1_048_576, floor / 1_048_576))
    for f, sz in sizes:
        print('    %s  %.2fMB' % (f, sz / 1_048_576))
print('count:', len(suspicious))
"""


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    query_oneline = QUERY.replace("\n", "\\n")
    remote = (
        f"cd {DEPLOY_PATH} && "
        f"COMPOSE='{compose_files()}' && "
        f"$COMPOSE exec -T api python -c \"exec('''{QUERY}''')\""
    )
    _ssh_run(TIDAL_HOST, TIDAL_USER, pw, remote, timeout=120)


if __name__ == "__main__":
    main()
