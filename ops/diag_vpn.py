#!/usr/bin/env python3
import base64
import json
import sqlite3
import subprocess
import urllib.parse

cfg = json.load(open("/var/lib/marzban/xray_config.json"))
for ib in cfg["inbounds"]:
    if ib.get("protocol") == "vless":
        rs = ib["streamSettings"]["realitySettings"]
        print("port", ib["port"], "clients_file", len(ib["settings"]["clients"]))
        print("privateKey", rs.get("privateKey"))
        print("shortIds", rs.get("shortIds"))

sub = subprocess.check_output(
    ["curl", "-sk", "https://127.0.0.1:8000/sub/a2V5LTEsMTc4MDU4MTM1OAvPlvmbHy_x"],
    text=True,
)
line = base64.b64decode(sub).decode()
print("sub_line", line)
q = urllib.parse.parse_qs(line.split("?", 1)[1].split("#", 1)[0])
print("pbk", q.get("pbk"))
print("sid", q.get("sid"))

con = sqlite3.connect("/var/lib/marzban/db.sqlite3")
row = con.execute("SELECT key, certificate FROM tls LIMIT 1").fetchone()
if row:
    print("tls_key_len", len(row[0] or ""), "cert_len", len(row[1] or ""))
