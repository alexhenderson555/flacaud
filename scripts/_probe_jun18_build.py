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

BUNDLE = "index-DqMBVLZD.js"
dist = f"{DEPLOY_PATH}/frontend/dist"
pw = _password("TIDAL_SSH_PASSWORD")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(TIDAL_HOST, username=TIDAL_USER, password=pw, timeout=30)
cmds = [
    f"ls -la {dist}/assets/{BUNDLE} {dist}/assets/index-C8IQtxPH.css {dist}/assets/index-OYOtzu1a.css 2>&1",
    f"grep -o 'index-[A-Za-z0-9_-]*\\.css' {dist}/assets/{BUNDLE} | sort -u",
    f"ls -la {dist}/assets/Account-DjUc-PH6.js {dist}/assets/vendor-BTZx29KN.js 2>&1",
    f"wc -c {dist}/sw.js; grep -c DqMBVLZD {dist}/sw.js || echo 0",
]
out = ROOT / "scripts" / "_jun18_probe.txt"
lines = []
for c in cmds:
    lines.append(f"=== {c} ===")
    _, o, e = ssh.exec_command(c)
    lines.append(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        lines.append(err)
ssh.close()
out.write_text("\n".join(lines), encoding="utf-8")
print(f"wrote {out}")
