#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv(ROOT / ".env")
import paramiko
from repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password

pw = _password("TIDAL_SSH_PASSWORD")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)
dist = f"{DEPLOY_PATH}/frontend/dist"
cmds = [
    f"grep -c DqMBVLZD {dist}/sw.js || echo 0",
    f"grep -c DvoSUjGd {dist}/sw.js || echo 0",
    f"head -c 800 {dist}/index.html",
    f"ls -la {dist}/assets/vendor-BTZx29KN.js {dist}/assets/vendor-D8rFRXBT.js 2>&1",
    f"grep -o 'Genreverse[^\"]*' {dist}/assets/index-DqMBVLZD.js | head -3",
]
for c in cmds:
    print("---", c[:70])
    _, o, e = ssh.exec_command(c)
    print(o.read().decode())
    err = e.read().decode()
    if err:
        print("ERR:", err)
ssh.close()
