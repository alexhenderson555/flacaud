#!/usr/bin/env python3
"""Remove a Tidal pool account on prod. Usage: python scripts/_remove_pool_account.py 2"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

ACCOUNT_ID = int(sys.argv[1]) if len(sys.argv) > 1 else 2

REMOTE = f"""
from sqlalchemy import select
from tidal_dl_ru.providers.tidal import pool as p
from tidal_dl_ru.providers.tidal.pool import TidalAccount, session

aid = {ACCOUNT_ID}
with session() as s:
    acc = s.get(TidalAccount, aid)
    if acc:
        print("BEFORE", acc.id, acc.label, acc.status, acc.user_id)
    else:
        print("BEFORE missing", aid)
ok = p.remove_account(aid)
print("REMOVED", ok)
with session() as s:
    for a in s.scalars(select(TidalAccount).order_by(TidalAccount.id)).all():
        print("LEFT", a.id, a.label, a.status, a.user_id)
"""

blob = base64.b64encode(REMOTE.encode()).decode()
inner = f"import base64; exec(base64.b64decode({blob!r}).decode())"
cmd = f"cd {DEPLOY_PATH} && docker compose exec -T api python -c {inner!r}"
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=60))
