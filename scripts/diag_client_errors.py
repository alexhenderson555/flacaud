#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv(ROOT / ".env", override=True)
import paramiko

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, compose_files

pw = _password("TIDAL_SSH_PASSWORD")
cf = compose_files()
cmd = (
    f"cd {DEPLOY_PATH} && COMPOSE='{cf}' && "
    "$COMPOSE logs api --tail 300 2>&1 | grep -i client_error | tail -20; "
    "echo '---'; "
    "$COMPOSE logs api --tail 300 2>&1 | grep error_boundary | tail -10; "
    "echo '---'; "
    "$COMPOSE logs api --tail 50 2>&1 | grep 'POST /api/client-errors' | tail -5"
)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)
_, stdout, _ = ssh.exec_command(cmd, timeout=60)
print(stdout.read().decode("utf-8", errors="replace"))
ssh.close()
