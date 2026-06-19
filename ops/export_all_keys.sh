#!/bin/bash
# Export clean vless + subscription for users matching pattern
cd /opt/marzban
PATTERN="${1:-key-}"
python3 /root/export_clean_vless.py 2>/dev/null | awk -v p="$PATTERN" '
/^=== / { name=$2; show=(index(name,p)>0 || p=="") }
show && /^vless:\/\// { print name": "$0 }
'
echo "--- SUB LINKS ---"
for u in $(docker compose exec -T marzban marzban-cli user list 2>/dev/null | grep -oE 'key-[0-9]+' | sort -u); do
  case "$u" in *"$PATTERN"*) ;;
    *) continue ;;
  esac
  sub=$(echo "$u" | docker compose exec -T marzban marzban-cli subscription get-link 2>/dev/null | tr -d '\r' | grep -oE 'https://[^ ]+')
  echo "$u: $sub"
done
