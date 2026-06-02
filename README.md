# Tidal-DL-RU

Advanced high-fidelity DJ and Music Player Web Engine — FLAC from Tidal and other sources, Telegram bot, PWA.

## Quick start

```bash
cp .env.example .env
# Set TIDALDLRU_JWT_SECRET, TIDALDLRU_SIGNING_SECRET, TIDALDLRU_BOT_TOKEN
python -c "import secrets; print(secrets.token_urlsafe(48))"

cd frontend && npm install && npm run build && cd ..
docker compose up -d --build
# → http://localhost:8001
```

Dev frontend: `cd frontend && npm run dev` (proxies `/api` to `:8000`).

## Production checklist

- [ ] `TIDALDLRU_ENV=production` (set in compose)
- [ ] Strong `TIDALDLRU_JWT_SECRET` + `TIDALDLRU_SIGNING_SECRET`
- [ ] TLS: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` + `DOMAIN` in `.env`
- [ ] Postgres (optional): `docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d`
- [ ] SSH deploy only — **never commit passwords** (`scripts/deploy.py`)
- [ ] GitHub secrets: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`
- [ ] Backups: `ops/backup-db.sh`
- [ ] Legal: [docs/LEGAL.md](docs/LEGAL.md)

## Architecture

| Layer | Stack |
|-------|--------|
| API / Bot | FastAPI, slim `Dockerfile.api` (~no torch) |
| Worker | ARQ + demucs, `Dockerfile.worker` |
| Queue | Redis |
| DB | SQLite (default) or Postgres via `DATABASE_URL` |
| Frontend | React 19, Vite, PWA |

Security: JWT auth, short-lived media tokens, rate limits on login/search, SSRF-safe image proxy, security headers.

## Commands

```bash
make test          # pytest
make lint          # ruff
make e2e           # Playwright (toast + progress)
make e2e-api       # live remote API flow
make deploy        # DEPLOY_HOST + DEPLOY_SSH_KEY
```

## Ops

See [ops/RUNBOOK.md](ops/RUNBOOK.md).

## Testing

```bash
pytest tests/
E2E_RUN_LIVE=1 pytest tests/test_remote_flow_live.py
python scripts/e2e_remote_flow.py
cd frontend && npm run e2e
```

CI runs on every push/PR (`.github/workflows/ci.yml`); deploy after green CI on `master` (`.github/workflows/deploy.yml`).
