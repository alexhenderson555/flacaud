#!/usr/bin/env python3
"""Verify observability stack on production server."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env", override=True)
except ImportError:
    pass

from scripts.repair_servers import (  # noqa: E402
    TIDAL_HOST,
    TIDAL_USER,
    _password,
    _ssh_run,
    compose_files,
)


def main() -> None:
    pw = _password("TIDAL_SSH_PASSWORD")
    cf = compose_files()
    cmd = (
        f"cd /opt/tidal-dl-ru && COMPOSE='{cf}' && "
        "$COMPOSE ps --format 'table {{.Name}}\t{{.Status}}' && "
        "echo '--- api metrics from prometheus net ---' && "
        "$COMPOSE exec -T prometheus wget -qO- http://api:8000/internal/metrics/prometheus 2>&1 | head -3 && "
        "echo '--- prometheus targets ---' && "
        "$COMPOSE exec -T prometheus wget -qO- http://localhost:9090/api/v1/targets 2>/dev/null | "
        "python3 -c \"import sys,json; d=json.load(sys.stdin); "
        "[print(t['labels'].get('job'), t['health'], t.get('lastError','')) for t in d['data']['activeTargets']]\" && "
        "echo '--- loki ready ---' && "
        "$COMPOSE exec -T loki wget -qO- http://localhost:3100/ready 2>&1 && echo"
    )
    code = _ssh_run(TIDAL_HOST, TIDAL_USER, pw, cmd, timeout=120)
    if code != 0:
        raise SystemExit(code)
    print("Observability verification done.")


if __name__ == "__main__":
    main()
