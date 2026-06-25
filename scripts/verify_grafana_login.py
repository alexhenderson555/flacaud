#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv(ROOT / ".env", override=True)
import paramiko

from scripts.repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password, compose_files

password = sys.argv[1] if len(sys.argv) > 1 else "Henderson55"
pw = _password("TIDAL_SSH_PASSWORD")
cf = compose_files()
cmd = (
    f"cd {DEPLOY_PATH} && COMPOSE='{cf}' && "
    f"curl -sf -u admin:{password} http://127.0.0.1:3000/api/user; echo exit:$?"
)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)
_, stdout, _ = ssh.exec_command(cmd, timeout=30)
out = stdout.read().decode("utf-8", errors="replace")
print(out)
ssh.close()
