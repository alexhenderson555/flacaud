#!/bin/bash
cd /opt/marzban
USERS="alex-test friend-1 friend-2 friend-3 friend-4 friend-5"
for u in $USERS; do
  echo "=== $u ==="
  link=$(echo "$u" | docker compose exec -T marzban marzban-cli subscription get-link 2>/dev/null | tr -d '\r' | grep -oE 'https://[^ ]+')
  echo "SUB: $link"
  cfg=$(echo "$u" | docker compose exec -T marzban marzban-cli subscription get-config 2>/dev/null | tr -d '\r')
  echo "$cfg" | grep -oE 'vless://[^ ]+' | head -1
  echo
done
