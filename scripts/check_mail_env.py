#!/usr/bin/env python3
"""Check Resend mail env on production (no secret values printed)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")


if (ROOT / ".env.local").is_file():


    load_dotenv(ROOT / ".env.local", override=True)

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run

REMOTE = f"""
cd {DEPLOY_PATH}
echo '--- .env ---'
grep -E '^(RESEND_API_KEY|TIDALDLRU_EMAIL_FROM)=' .env 2>/dev/null | sed 's/=.*$/=***set***/' || true
echo '--- api container ---'
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T api python -c "
import os
k=os.environ.get('RESEND_API_KEY','')
f=os.environ.get('TIDALDLRU_EMAIL_FROM','') or os.environ.get('TIDALDLRU_SMTP_FROM','')
print('RESEND_API_KEY:', 'set len='+str(len(k)) if k else 'MISSING')
print('EMAIL_FROM:', repr(f) if f else 'MISSING')
"
echo '--- recent password reset logs ---'
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs api --tail 200 2>/dev/null | grep -i password_reset || echo '(none)'
"""


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    code = _ssh_run(TIDAL_HOST, TIDAL_USER, pw, REMOTE.strip(), timeout=120)
    sys.exit(code)


if __name__ == "__main__":
    main()
