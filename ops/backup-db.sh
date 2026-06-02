#!/usr/bin/env bash
# Backup SQLite user DB from the running api container.
set -euo pipefail
DEPLOY_PATH="${DEPLOY_PATH:-/opt/tidal-dl-ru}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tidal-dl-ru}"
mkdir -p "$BACKUP_DIR"
cd "$DEPLOY_PATH"
docker compose exec -T api cat /var/lib/tidal-dl-ru/db/flacaudio.db > "$BACKUP_DIR/flacaudio-$STAMP.db"
echo "Saved $BACKUP_DIR/flacaudio-$STAMP.db"
