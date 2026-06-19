#!/usr/bin/env python3
"""Test Gemini model availability from production API container."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except ImportError:
    pass

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, _ssh_run


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    remote_py = (
        "import httpx,os; k=os.environ.get('GEMINI_API_KEY',''); "
        "payload={'contents':[{'parts':[{'text':'Reply with OK only'}]}]}; "
        "models=['gemini-2.0-flash','gemini-1.5-flash','gemini-2.5-flash','gemini-2.5-flash-lite']; "
        "exec('for m in models:\\n"
        " r=httpx.post(f\"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={k}\", json=payload, timeout=30)\\n"
        " print(m, r.status_code, (r.text[:120]+\"...\") if len(r.text)>120 else r.text)')"
    )
    # simpler one-liner without exec
    remote_py = (
        "import httpx,os; k=os.environ.get('GEMINI_API_KEY',''); "
        "payload={'contents':[{'parts':[{'text':'OK'}]}]}; "
        "models=['gemini-2.0-flash','gemini-1.5-flash','gemini-2.5-flash','gemini-2.5-flash-lite']; "
        "[(lambda m: print(m, (lambda r: (r.status_code, r.text[:100]))(httpx.post('https://generativelanguage.googleapis.com/v1beta/models/'+m+':generateContent?key='+k, json=payload, timeout=30))))(m) for m in models]"
    )
    cmd = (
        f"cd {DEPLOY_PATH} && "
        "docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T api "
        f"python -c {remote_py!r}"
    )
    sys.exit(_ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=120))


if __name__ == "__main__":
    main()
