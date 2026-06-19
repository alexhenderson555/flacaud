#!/bin/bash
# Fix Marzban: SQLite lock + enable TLS for panel/sub + regenerate Xray clients
set -euo pipefail
cd /opt/marzban

echo "=== stop marzban ==="
docker compose stop marzban

echo "=== SQLite WAL + fix VLESS flow for REALITY ==="
python3 << 'PY'
import json
import sqlite3

db = "/var/lib/marzban/db.sqlite3"
con = sqlite3.connect(db, timeout=60)
con.execute("PRAGMA journal_mode=WAL")
con.execute("PRAGMA busy_timeout=60000")
cur = con.cursor()
updated = 0
for pid, settings in cur.execute("SELECT id, settings FROM proxies WHERE type='VLESS'"):
    data = json.loads(settings)
    if data.pop("flow", None) is not None:
        cur.execute("UPDATE proxies SET settings=? WHERE id=?", (json.dumps(data), pid))
        updated += 1
con.commit()
print(f"proxies flow cleared: {updated}")
con.close()
PY

echo "=== enable UVICORN SSL + subscription prefix ==="
ENV_FILE="/opt/marzban/.env"
touch "$ENV_FILE"
grep -q '^UVICORN_SSL_CERTFILE=' "$ENV_FILE" && sed -i 's|^UVICORN_SSL_CERTFILE=.*|UVICORN_SSL_CERTFILE=/var/lib/marzban/cert.pem|' "$ENV_FILE" || echo 'UVICORN_SSL_CERTFILE=/var/lib/marzban/cert.pem' >> "$ENV_FILE"
grep -q '^UVICORN_SSL_KEYFILE=' "$ENV_FILE" && sed -i 's|^UVICORN_SSL_KEYFILE=.*|UVICORN_SSL_KEYFILE=/var/lib/marzban/key.pem|' "$ENV_FILE" || echo 'UVICORN_SSL_KEYFILE=/var/lib/marzban/key.pem' >> "$ENV_FILE"
grep -q '^XRAY_SUBSCRIPTION_URL_PREFIX=' "$ENV_FILE" && sed -i 's|^XRAY_SUBSCRIPTION_URL_PREFIX=.*|XRAY_SUBSCRIPTION_URL_PREFIX=https://151.243.177.88:8000|' "$ENV_FILE" || echo 'XRAY_SUBSCRIPTION_URL_PREFIX=https://151.243.177.88:8000' >> "$ENV_FILE"

ufw allow 8000/tcp comment 'Marzban panel/sub' 2>/dev/null || true

echo "=== start marzban ==="
docker compose up -d marzban
sleep 10

echo "=== verify xray clients ==="
python3 << 'PY'
import json
with open("/var/lib/marzban/xray_config.json") as f:
    cfg = json.load(f)
for ib in cfg.get("inbounds", []):
    n = len(ib.get("settings", {}).get("clients", []))
    print(ib.get("tag"), "port", ib.get("port"), "clients", n)
PY

ss -tlnp | grep -E ':8000|:8443' || true
docker compose logs marzban --tail 15
