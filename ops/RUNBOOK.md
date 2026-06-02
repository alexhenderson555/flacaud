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
