#!/bin/bash
set -e
cd /opt/marzban
docker cp /root/fix_proxies_flow_empty.py marzban-marzban-1:/tmp/fix.py
docker compose exec -T marzban python3 /tmp/fix.py
docker compose restart marzban
sleep 14
python3 /root/export_clean_vless.py key-
python3 /root/export_subs.py
echo "=== clash sub key-1 bytes ==="
curl -sk -H 'User-Agent: clash' 'https://127.0.0.1:8000/sub/a2V5LTEsMTc4MDU4MTM1OAvPlvmbHy_x' | wc -c
echo "=== v2ray sub key-1 ==="
curl -sk -H 'User-Agent: v2ray' 'https://127.0.0.1:8000/sub/a2V5LTEsMTc4MDU4MTM1OAvPlvmbHy_x' | base64 -d
echo
