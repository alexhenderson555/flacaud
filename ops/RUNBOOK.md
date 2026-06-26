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

## Backup

```bash
bash ops/backup-db.sh
```

Uses SQLite dump by default; if `.env` has `DATABASE_URL=postgresql…`, runs `pg_dump` instead.

**Restore Postgres:** `psql -U tidal -d tidaldl < /var/backups/tidal-dl-ru/tidaldl-YYYYMMDD.sql`

## Ops metrics

Set `TIDALDLRU_OPS_API_KEY` in production `.env`, then:

```bash
curl -H "X-Ops-Key: $TIDALDLRU_OPS_API_KEY" https://flacaud.ru/api/metrics
curl -H "X-Ops-Key: $TIDALDLRU_OPS_API_KEY" https://flacaud.ru/api/metrics/prometheus
```

`/api/logs` and `/api/pool/health` require the same key. Without the key in production these endpoints return 404/401.

**Prometheus alerts:** example rules in `ops/prometheus/alerts.yml` (health, disk >85%, stream errors, Tidal pool).

**Full observability stack (recommended):** Prometheus + Loki + Promtail + Grafana — see `ops/observability/README.md`. Enable with `TIDAL_ENABLE_OBSERVABILITY=1` and `GRAFANA_ADMIN_PASSWORD` in `.env`. Graylog is intentionally **not** used (too heavy for a single VPS; Loki integrates with the same Grafana UI).

**Browser errors:** frontend POSTs to `/api/client-errors` (always). Query in Loki: `{service="api"} | json | event="client_error"`.

**Sentry (optional):** set `TIDALDLRU_SENTRY_DSN` on API and `VITE_SENTRY_DSN` at frontend build time. Without DSN, Sentry is disabled.

**Auth:** short-lived access JWT (~1h) + httpOnly refresh cookie (`/api/auth/refresh`, `/api/auth/logout`). Email verification on register; set `TIDALDLRU_REQUIRE_EMAIL_VERIFY=true` to block login until verified.

## Disk cleanup

Worker runs `disk_cleanup_task` on a cron schedule (03:00 and 15:00 UTC). Tune via:

- `TIDALDLRU_JOB_TTL` — job directory max age
- `TIDALDLRU_FILE_TTL` — stream-cache file max age
- `TIDALDLRU_STREAM_CACHE_MAX_BYTES` — LRU cap (default 8 GB)

**Cron (daily 03:00 UTC):**

```cron
0 3 * * * root cd /opt/tidal-dl-ru && bash ops/backup-db.sh >> /var/log/tidal-backup.log 2>&1
```

See `ops/backup-db.cron.example`.

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
