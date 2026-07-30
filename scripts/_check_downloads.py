#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

cmd = f'''cd {DEPLOY_PATH} && docker compose exec -T api python -c "
from sqlalchemy import select
from tidal_dl_ru.core.db import session
from tidal_dl_ru.models.user import User
from tidal_dl_ru.models.history import DownloadHistory
import datetime

with session() as s:
    # Get recent downloads
    today = datetime.datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    downloads = s.scalars(
        select(DownloadHistory)
        .where(DownloadHistory.created_at >= today)
        .order_by(DownloadHistory.created_at.desc())
        .limit(20)
    ).all()
    
    print(f'Total downloads today in DB: {{len(downloads)}}')
    for d in downloads:
        user = s.scalar(select(User).where(User.id == d.user_id))
        print(f'{{d.created_at}} | User: {{user.email if user else d.user_id}} | Track ID: {{d.provider_id}} | Status: {{d.status}}')
"'''
raise SystemExit(_ssh_run(TIDAL_HOST, TIDAL_USER, _password("TIDAL_SSH_PASSWORD"), cmd, timeout=60))
