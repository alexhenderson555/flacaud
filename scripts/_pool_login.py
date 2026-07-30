#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

cmd = f'''cd {DEPLOY_PATH} && docker compose exec -T api python -c "
from sqlalchemy import select
from tidal_dl_ru.providers.tidal.pool import TidalAccount, session
import json
with session() as s:
    rows = s.scalars(select(TidalAccount)).all()
    for a in rows:
        try:
            data = json.loads(a.session_data)
            print(a.id, getattr(a, 'username', getattr(a, 'email', getattr(a, 'label', 'unknown'))), data.get('email', 'no email in session'), data.get('username', 'no username in session'), data.get('userId', 'no userid'))
        except Exception as e:
            print('err', e)
"'''
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=60))
