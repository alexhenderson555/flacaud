#!/usr/bin/env python3
"""Find historical sw.js on server that matches a bundle."""
import os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from dotenv import load_dotenv
load_dotenv(ROOT / ".env")
import paramiko
from repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password

bundles = ["DqMBVLZD", "wKFqaT4y", "DmuBeNZX", "UKDqZaNC", "DvoSUjGd", "C6RLmBVZ"]
pw = _password("TIDAL_SSH_PASSWORD")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)
dist = f"{DEPLOY_PATH}/frontend/dist"
for b in bundles:
    _, o, _ = ssh.exec_command(f"grep -l '{b}' {dist}/sw.js {dist}/assets/*.js 2>/dev/null | head -3")
    hits = o.read().decode().strip()
    print(f"{b}: {hits or '(none in sw)'}")
_, o, _ = ssh.exec_command(f"ls -la {dist}/sw*.js {dist}/assets/workbox*.js 2>/dev/null")
print(o.read().decode())
ssh.close()
