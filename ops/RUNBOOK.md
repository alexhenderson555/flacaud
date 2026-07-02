# Production runbook

## Health

```bash
curl -s http://localhost:8001/healthz | jq
# ok=true requires db + redis in production
```

## Deploy (from dev machine)

Full playbook: **[docs/DEPLOY.md](../docs/DEPLOY.md)**.

```bash
export TIDAL_SSH_PASSWORD='...'   # or DEPLOY_SSH_KEY
# DEPLOY_MODE=tar|registry  (auto: registry if DOCKERHUB_* set)
python scripts/deploy_tidal.py
```

**Tar mode (default):** `app.tar.gz` → SCP → extract → `docker compose build` on server. Ships **local working tree**, not only `git` HEAD.

**Registry mode:** push `flacaud-api/worker/bot` to Docker Hub, pull on server.

Or on the server (git-based, if repo is current):

```bash
cd /opt/tidal-dl-ru && git pull && docker compose build && docker compose up -d
docker compose restart caddy api bot
```

Post-deploy: `curl -s https://flacaud.ru/healthz | jq` · hard refresh browser (**Ctrl+Shift+R**).

## TLS (Caddy)

1. Point DNS `A` record to the server.
2. Set in `.env`: `DOMAIN=flac.example.com`, `ACME_EMAIL=you@example.com`
3. `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`

## Postgres

```bash
# .env: POSTGRES_PASSWORD=...
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

## Database migrations (Alembic)

Schema is managed by **Alembic** (`migrations/versions/`). On API startup, `create_db_and_tables()` runs `alembic upgrade head`.

**Fresh install:** tables created automatically.

**Existing prod DB** (created before Alembic): on first boot with Alembic, the API detects legacy tables and runs `alembic stamp head` — no data loss.

Manual commands (from repo root on server or locally):

```bash
make migrate          # alembic upgrade head
make migrate-stamp    # mark current schema as head without running DDL
uv run alembic current
uv run alembic history
```

New schema changes: add a revision under `migrations/versions/`, deploy, restart API.

## Backup and restore

### Objectives

| Objective | Target | Notes |
|-----------|--------|-------|
| **RPO** (Recovery Point Objective) | 24 hours | Daily cron backup at 03:00 UTC. Worst-case data loss = 1 day. |
| **RTO** (Recovery Time Objective) | 30 minutes | From "decide to restore" to "API serving requests from restored DB". |

### Automated backup (cron)

```cron
# /etc/cron.d/tidal-dl-backup
0 3 * * * root cd /opt/tidal-dl-ru && bash ops/backup-db.sh >> /var/log/tidal-backup.log 2>&1
```

The script (`ops/backup-db.sh`) auto-detects Postgres vs SQLite:
- **Postgres:** `pg_dump` via `docker compose exec -T postgres pg_dump -U tidal tidaldl > /var/backups/tidal-dl-ru/tidaldl-YYYYMMDD-HHMMSS.sql`
- **SQLite:** copies `/var/lib/tidal-dl-ru/db/flacaudio.db` to `/var/backups/tidal-dl-ru/flacaudio-YYYYMMDD-HHMMSS.db`

Backups land in `/var/backups/tidal-dl-ru/`.

### Manual backup (Postgres)

Run on the server:

```bash
cd /opt/tidal-dl-ru
source .env  # load POSTGRES_USER, POSTGRES_DB, POSTGRES_PASSWORD

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/var/backups/tidal-dl-ru"
mkdir -p "$BACKUP_DIR"

# Full plain-SQL dump (restorable with psql)
docker compose -f docker-compose.yml -f docker-compose.postgres.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-tidal}" "${POSTGRES_DB:-tidaldl}" \
  > "$BACKUP_DIR/tidaldl-$STAMP.sql"

echo "Saved $BACKUP_DIR/tidaldl-$STAMP.sql ($(du -h "$BACKUP_DIR/tidaldl-$STAMP.sql" | cut -f1))"
```

For a compressed dump (smaller, slower):

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml exec -T postgres \
  pg_dump -Fc -U "${POSTGRES_USER:-tidal}" "${POSTGRES_DB:-tidaldl}" \
  > "$BACKUP_DIR/tidaldl-$STAMP.dump"
```

### Off-site copy (recommended)

After the cron backup, sync to off-site storage to protect against VPS loss:

```bash
# rsync to a remote backup host
rsync -az --delete /var/backups/tidal-dl-ru/ backupuser@backup-host:/backups/flacaud/
```

Or upload to S3-compatible storage:

```bash
aws s3 sync /var/backups/tidal-dl-ru/ s3://flacaud-backups/db/ --delete
```

### Restore (Postgres)

**Prerequisite:** `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD` set in `.env`.

```bash
cd /opt/tidal-dl-ru
source .env

# 1. Stop API and worker to prevent writes during restore
docker compose -f docker-compose.yml -f docker-compose.postgres.yml stop api worker

# 2. Restore from a plain-SQL dump
docker compose -f docker-compose.yml -f docker-compose.postgres.yml exec -T postgres \
  psql -U "${POSTGRES_USER:-tidal}" "${POSTGRES_DB:-tidaldl}" \
  < /var/backups/tidal-dl-ru/tidaldl-YYYYMMDD-HHMMSS.sql

# 3. Or restore from a compressed dump
docker compose -f docker-compose.yml -f docker-compose.postgres.yml exec -T postgres \
  pg_restore -U "${POSTGRES_USER:-tidal}" -d "${POSTGRES_DB:-tidaldl}" --clean --if-exists \
  < /var/backups/tidal-dl-ru/tidaldl-YYYYMMDD-HHMMSS.dump

# 4. Restart services
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

### Restore (SQLite)

```bash
cd /opt/tidal-dl-ru
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# 1. Stop API
$COMPOSE stop api

# 2. Copy backup into the db volume
docker cp /var/backups/tidal-dl-ru/flacaudio-YYYYMMDD-HHMMSS.db \
  $("$COMPOSE ps -q api"):/var/lib/tidal-dl-ru/db/flacaudio.db

# 3. Restart
$COMPOSE up -d
```

### Restore verification

After any restore, verify integrity before declaring the incident resolved:

```bash
# 1. Health check — DB + Redis must report ok=true
curl -s http://localhost:8001/healthz | jq .ok
# Expected: true

# 2. Row counts — compare against pre-incident numbers
docker compose -f docker-compose.yml -f docker-compose.postgres.yml exec postgres \
  psql -U "${POSTGRES_USER:-tidal}" "${POSTGRES_DB:-tidaldl}" -c \
  "SELECT 'users' AS tbl, count(*) FROM users
   UNION ALL SELECT 'jobs', count(*) FROM jobs
   UNION ALL SELECT 'refresh_tokens', count(*) FROM refresh_tokens;"

# 3. Smoke-test the API
curl -s https://flacaud.ru/healthz | jq .
curl -s https://flacaud.ru/api/quality/tidal:TRACK_ID/available \
  -H "Authorization: Bearer $TOKEN" | jq .

# 4. Check logs for errors during startup
docker compose logs api --tail 50 | grep -i error

# 5. Verify Prometheus sees the restored instance
curl -s http://127.0.0.1:9090/api/v1/query?query=flacaud_health_ok | jq .
```

If any check fails, do not declare the incident resolved — investigate the backup file or re-run the restore with an earlier dump.

### Backup retention

| Retention | Location | Purpose |
|-----------|----------|---------|
| 7 daily | `/var/backups/tidal-dl-ru/` | Quick local restore |
| 4 weekly | Off-site (rsync/S3) | Survives VPS loss |
| 12 monthly | Off-site (S3 Glacier) | Long-term compliance |

Implement local rotation with a cron job:

```bash
# Keep only the last 7 daily backups locally
find /var/backups/tidal-dl-ru -name "tidaldl-*.sql" -mtime +7 -delete
find /var/backups/tidal-dl-ru -name "flacaudio-*.db" -mtime +7 -delete
```

## SLOs and SLIs

### Service Level Objectives (SLOs)

| SLO | Target | Window | Error budget |
|-----|--------|--------|--------------|
| API latency (p95) | < 500 ms | 30 days | 5% of requests may exceed 500 ms |
| API uptime | 99.9 % | 30 days | 43.2 min downtime allowed per 30 days |
| API error rate (5xx) | < 0.1 % | 30 days | 0.1 % of responses may be 5xx |

**Error budget (uptime):** 43.2 minutes per 30-day window. If consumed, freeze non-essential deploys and prioritise reliability work.

**Error budget (errors):** 0.1 % of all HTTP responses. For ~1 M requests/month, that is ~1000 5xx responses allowed.

### Service Level Indicators (SLIs)

All SLIs are emitted by the API's `/internal/metrics/prometheus` endpoint and scraped by Prometheus every 30 s.

| SLI | Prometheus metric | Description |
|-----|-------------------|-------------|
| Request latency | `flacaud_http_requests_total{...}` (counter) | Per-method, per-route, per-status-class request count. Use `rate()` + `histogram_quantile()` once histogram buckets are added. |
| Error rate (5xx) | `flacaud_http_requests_total{status_class="5xx"}` | Ratio of 5xx responses to total responses. |
| Uptime | `flacaud_health_ok` (gauge) | Aggregate health = 1 when DB + Redis are reachable. |
| Stream errors | `flacaud_stream_errors_total{kind="..."}` | Counter incremented on `not_ready` / `failed` stream events. |
| Tidal pool health | `flacaud_tidal_pool_healthy` (gauge) | 1 when at least one active Tidal account is available. |
| Disk usage | `flacaud_disk_used_ratio` (gauge) | Stream-cache bytes / max-cache-bytes ratio. |

### Prometheus alerting rules

Alert rules live in `ops/prometheus/alerts.yml` and are loaded automatically by the Prometheus container (see `ops/observability/prometheus/prometheus.yml`).

**Operational alerts (pre-existing):**

| Alert | Trigger | Severity | Action |
|-------|---------|----------|--------|
| `FlacAudHealthDown` | `flacaud_health_ok == 0` for 2m | critical | Check DB + Redis containers, `docker compose ps` |
| `FlacAudDiskHigh` | `flacaud_disk_used_ratio > 0.85` for 10m | warning | Run `disk_cleanup_task` or increase `TIDALDLRU_STREAM_CACHE_MAX_BYTES` |
| `FlacAudStreamErrorsHigh` | > 50 stream errors in 15m | warning | Check Tidal pool health, token refresh logs |
| `FlacAudTidalPoolLow` | `flacaud_tidal_pool_healthy < 1` for 5m | critical | Re-auth Tidal accounts; check `TIDALDLRU_POOL_KEY` |

**SLO-based alerts (added):**

| Alert | Trigger | Severity | Action |
|-------|---------|----------|--------|
| `FlacAudErrorBudgetBurnFast` | 5xx rate > 1 % over 5m for 5m | critical | Check API logs for tracebacks; verify DB/Redis; freeze deploys |
| `FlacAudErrorBudgetBurnSlow` | 5xx rate > 0.1 % over 1h for 30m | warning | Investigate recurring 5xx patterns; check downstream services |
| `FlacAudUptimeSLOBurn` | `avg_over_time(flacaud_health_ok[1h]) < 0.999` for 10m | warning | Health checks failing > 0.1 % of the hour; check restart loops |
| `FlacAudAPIHighErrorRate` | 5xx rate > 5/min for 2m | critical | Immediate investigation — `docker compose logs api --tail 100` |

**Alert routing:** In production with the observability stack enabled, Grafana Alerting or Alertmanager should route `critical` alerts to the on-call channel immediately and `warning` alerts to a Slack/email channel. Without Alertmanager, check the Prometheus Alerts UI at `http://127.0.0.1:9090/alerts` (via SSH tunnel).

## Ops metrics

Set `TIDALDLRU_OPS_API_KEY` in production `.env`, then:

```bash
curl -H "X-Ops-Key: $TIDALDLRU_OPS_API_KEY" https://flacaud.ru/api/metrics
curl -H "X-Ops-Key: $TIDALDLRU_OPS_API_KEY" https://flacaud.ru/api/metrics/prometheus
```

`/api/logs` and `/api/pool/health` require the same key. Without the key in production these endpoints return 404/401.

**Prometheus alerts:** rules in `ops/prometheus/alerts.yml` — see the [SLO/SLI section above](#slos-and-slis) for the full alert catalogue.

**Full observability stack (recommended):** Prometheus + Loki + Promtail + Grafana — see `ops/observability/README.md`. Enable with `TIDAL_ENABLE_OBSERVABILITY=1` and `GRAFANA_ADMIN_PASSWORD` in `.env`. Graylog is intentionally **not** used (too heavy for a single VPS; Loki integrates with the same Grafana UI).

**Browser errors:** frontend POSTs to `/api/client-errors` (always). Query in Loki: `{service="api"} | json | event="client_error"`.

**Sentry (optional):** set `TIDALDLRU_SENTRY_DSN` on API and `VITE_SENTRY_DSN` at frontend build time. Without DSN, Sentry is disabled.

**Auth:** short-lived access JWT (~1h) + httpOnly refresh cookie (`/api/auth/refresh`, `/api/auth/logout`). Email verification on register; set `TIDALDLRU_REQUIRE_EMAIL_VERIFY=true` to block login until verified.

## Disk cleanup

Worker runs `disk_cleanup_task` on a cron schedule (03:00 and 15:00 UTC). Tune via:

- `TIDALDLRU_JOB_TTL` — job directory max age
- `TIDALDLRU_FILE_TTL` — stream-cache file max age
- `TIDALDLRU_STREAM_CACHE_MAX_BYTES` — LRU cap (default 8 GB)

Backup cron setup is documented in the [Backup and restore](#backup-and-restore) section above. See also `ops/backup-db.cron.example`.

## Rotate secrets

1. Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"`
2. Update `.env` on server (`TIDALDLRU_JWT_SECRET`, `TIDALDLRU_SIGNING_SECRET`)
3. `docker compose up -d --force-recreate api worker bot`
4. Users must re-login (JWT rotation).

## Logs

All services log to **stdout** (JSON in production if `TIDALDLRU_LOG_FORMAT=json`).

```bash
cd /opt/tidal-dl-ru
docker compose logs -f api --tail 200
docker compose logs -f worker --tail 200
docker compose logs -f bot --tail 100
```

Useful grep patterns:

```bash
docker compose logs api --tail 500 | grep auth_login
docker compose logs api --tail 500 | grep '"status": 401'
docker compose logs api --tail 500 | grep rate_limit
docker compose logs worker --tail 200 | grep job_
```

Each HTTP response includes `X-Request-Id` — search logs with the same id.

Set `TIDALDLRU_LOG_LEVEL=DEBUG` in `.env` and `docker compose up -d --force-recreate api` for auth troubleshooting.

## Incident: API 502 after deploy

Wait ~30s for healthcheck. Check logs:

```bash
docker compose logs api --tail 100
docker compose ps
```

## Incident: downloads stuck

```bash
docker compose logs worker --tail 100
docker compose exec redis redis-cli ping
```

## Incident: quality shows 320k but sounds lossless (or vice versa)

Usually stale stream without reload. Fixed in frontend (`streamRetryNonce` on `changeQuality`). After deploy: hard refresh. If persists, check `GET /api/quality/.../available` vs stream logs (`quality=`, `X-Stream-Mode`).

## Incident: artist portraits missing

1. `curl -s 'https://flacaud.ru/api/artist/tidal/ARTIST_ID' -H "Authorization: Bearer …" | jq .picture_source`
2. API logs for Wikipedia/Deezer timeouts.
3. Confirm image URL loads via `/api/image-proxy?url=…` (host must be on allowlist).
4. Cache TTL 7d — restart api clears in-memory cache for retest.

## Incident: Genreverse — same cover on every track

Ensure `recommendations.py` deploy includes `_finalize_track_covers`. Hard refresh; check network tab for distinct `cover_url` per track.
