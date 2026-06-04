# Production runbook

## Health

```bash
curl -s http://localhost:8001/healthz | jq
# ok=true requires db + redis in production
```

## Deploy (from dev machine)

```bash
export DEPLOY_HOST=your.server
export DEPLOY_USER=root
export DEPLOY_SSH_KEY=~/.ssh/id_ed25519
python scripts/deploy.py
```

Or on the server (preferred):

```bash
cd /opt/tidal-dl-ru && git pull && docker compose build && docker compose up -d
```

## TLS (Caddy)

1. Point DNS `A` record to the server.
2. Set in `.env`: `DOMAIN=flac.example.com`, `ACME_EMAIL=you@example.com`
3. `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`

## Postgres

```bash
# .env: POSTGRES_PASSWORD=...
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

## Backup

```bash
bash ops/backup-db.sh
```

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
