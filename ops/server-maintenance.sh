#!/usr/bin/env bash
# Safe production cleanup on the tidal host (disk + Docker cache).
# Does not stop running containers or remove active images.
set -euo pipefail

COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml}"
JOBS_RETENTION_DAYS="${JOBS_RETENTION_DAYS:-14}"
BUILDER_KEEP_GB="${BUILDER_KEEP_GB:-3}"

echo "=== Disk before ==="
df -h / | tail -1
docker system df 2>/dev/null || true

echo "=== Prune Docker build cache (keep last ${BUILDER_KEEP_GB}GB) ==="
docker builder prune -f --reserved-space "${BUILDER_KEEP_GB}gb" 2>/dev/null \
  || docker builder prune -f --keep-storage "${BUILDER_KEEP_GB}gb" 2>/dev/null \
  || docker builder prune -f 2>/dev/null \
  || true

echo "=== Remove dangling images ==="
docker image prune -f 2>/dev/null || true

echo "=== Prune stopped containers (none expected) ==="
docker container prune -f 2>/dev/null || true

if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q '^marzban-marzban-1$'; then
  echo "=== Stop Marzban on tidal host (VPN belongs on 151 only) ==="
  docker stop marzban-marzban-1 2>/dev/null || true
fi

if [[ -d /opt/tidal-dl-ru/frontend/dist ]]; then
  echo "=== Prune stale frontend assets ==="
  bash /opt/tidal-dl-ru/ops/prune-frontend-dist.sh /opt/tidal-dl-ru/frontend/dist || true
fi

JOBS_VOL="/var/lib/docker/volumes/tidal-dl-ru_jobs-data/_data"
if [[ -d "$JOBS_VOL" ]]; then
  echo "=== Old download jobs (>${JOBS_RETENTION_DAYS}d) ==="
  before=$(du -sh "$JOBS_VOL" 2>/dev/null | cut -f1)
  find "$JOBS_VOL" -mindepth 1 -maxdepth 1 -type d -mtime "+${JOBS_RETENTION_DAYS}" -print -exec rm -rf {} + 2>/dev/null || true
  find "$JOBS_VOL" -maxdepth 1 -type f -name '*.zip' -mtime "+${JOBS_RETENTION_DAYS}" -print -delete 2>/dev/null || true
  after=$(du -sh "$JOBS_VOL" 2>/dev/null | cut -f1)
  echo "jobs volume: ${before:-?} -> ${after:-?}"
fi

echo "=== Disk after ==="
df -h / | tail -1
docker system df 2>/dev/null || true

echo "=== Compose health ==="
cd /opt/tidal-dl-ru
$COMPOSE ps
