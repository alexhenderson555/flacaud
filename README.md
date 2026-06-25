# FlacAud (tidal-dl-ru)

Production: **https://flacaud.ru**

Lossless Tidal streaming, FLAC downloads, library sync from 8 platforms, set analyzer, DJ tools, and AI playlists.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite, Zustand, framer-motion, PWA |
| API | FastAPI, SQLModel, JWT + HttpOnly refresh |
| Worker | ARQ, Redis, yt-dlp, Demucs (optional) |
| DB | PostgreSQL (prod) / SQLite (dev) |
| Edge | Caddy TLS reverse proxy |

## Local development

```bash
# Backend
uv sync --dev --extra worker
cp .env.example .env   # fill secrets
uv run uvicorn tidal_dl_ru.server.app:app --reload --port 8000

# Frontend
cd frontend && npm ci && npm run dev
```

Open http://localhost:5173 (API proxied to :8000).

## Tests

```bash
uv run pytest tests/ -q -k "not remote_flow_live"
cd frontend && npm run test && npm run lint && npm run build
```

## Production deploy

From repo root (Windows):

```powershell
$env:TIDAL_SSH_PASSWORD = "..."
python scripts/deploy_tidal.py
```

Deploy builds frontend, pushes Docker images tagged `FLACAUD_TAG`, runs compose with `docker-compose.prod.yml`, smoke-checks `https://flacaud.ru/api/providers`.

After deploy: **Ctrl+Shift+R** in the browser.

## Required production env

See `.env.example`. Critical:

- `TIDALDLRU_JWT_SECRET`, `TIDALDLRU_SIGNING_SECRET`
- `DATABASE_URL` (Postgres)
- `TIDALDLRU_POOL_KEY` (Tidal account pool)
- `GRAFANA_ADMIN_PASSWORD` (if observability overlay)

Optional: `SENTRY_DSN`, `RESEND_API_KEY`, YooKassa keys.

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design
- [docs/SECURITY_AUDIT.md](./docs/SECURITY_AUDIT.md) — security checklist
- [ops/RUNBOOK.md](./ops/RUNBOOK.md) — on-call operations

## Repository

https://github.com/alexhenderson555/flacaud
