#!/usr/bin/env bash
# Backup SQLite or Postgres user DB from the running api container.
set -euo pipefail
DEPLOY_PATH="${DEPLOY_PATH:-/opt/tidal-dl-ru}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tidal-dl-ru}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
mkdir -p "$BACKUP_DIR"
cd "$DEPLOY_PATH"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# DATABASE_URL is set on the api container via docker-compose.postgres.yml,
# NOT written into .env on the host -- grepping .env directly always missed
# it and silently fell back to backing up an unused, stale SQLite file while
# the app actually ran on Postgres. Ask the running container instead.
DB_URL="$($COMPOSE -f docker-compose.postgres.yml exec -T api printenv DATABASE_URL 2>/dev/null || true)"

if [[ "$DB_URL" == postgresql* ]]; then
  echo "Postgres mode — pg_dump via postgres service"
  docker compose -f docker-compose.yml -f docker-compose.postgres.yml exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-tidal}" "${POSTGRES_DB:-tidaldl}" \
    | gzip > "$BACKUP_DIR/tidaldl-$STAMP.sql.gz"
  echo "Saved $BACKUP_DIR/tidaldl-$STAMP.sql.gz"
else
  $COMPOSE exec -T api cat /var/lib/tidal-dl-ru/db/flacaudio.db | gzip > "$BACKUP_DIR/flacaudio-$STAMP.db.gz"
  echo "Saved $BACKUP_DIR/flacaudio-$STAMP.db.gz"
fi

# Keep the backup directory itself from becoming the next unbounded-growth
# incident (see ops/RUNBOOK.md stream-cache note) -- prune anything older
# than RETENTION_DAYS after each successful run.
find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -delete
echo "Pruned backups older than $RETENTION_DAYS days"
