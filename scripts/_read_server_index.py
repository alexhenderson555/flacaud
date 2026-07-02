#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from dotenv import load_dotenv

load_dotenv(ROOT / ".env")


if (ROOT / ".env.local").is_file():


    load_dotenv(ROOT / ".env.local", override=True)
import paramiko
from repair_servers import DEPLOY_PATH, TIDAL_HOST, TIDAL_USER, _password

pw = _password("TIDAL_SSH_PASSWORD")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)
dist = f"{DEPLOY_PATH}/frontend/dist"
_, o, _ = ssh.exec_command(f"cat {dist}/index.html")
html = o.read().decode("utf-8", errors="replace")
out = ROOT / "scripts" / "_server_index_snapshot.txt"
_, o, _ = ssh.exec_command(f"wc -c {dist}/sw.js; grep -o 'index-[A-Za-z0-9_-]*\\.js' {dist}/sw.js | sort -u | head -5")
extra = o.read().decode("utf-8", errors="replace")
out.write_text(html + "\n---\n" + extra, encoding="utf-8")
print(f"wrote {out}")
ssh.close()
