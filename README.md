# FlacAud (tidal-dl-ru)

Production: **https://flacaud.ru**

Lossless Tidal streaming, FLAC downloads, library sync from 8 platforms, set analyzer, DJ tools, AI playlists, free artist portraits (Wikipedia / Deezer / iTunes).

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
# Backend (~12 min full)
uv run pytest tests/ -q -k "not remote_flow_live"

# Frontend unit (282 tests)
cd frontend && npm run test && npm run lint && npm run build

# E2E (Playwright — needs stack or CI)
cd frontend && npm run e2e
```

**Snapshot (2026-06-17):** pytest **372** passed · vitest **282** passed · Playwright **52** pass / **8** fail (player/quality/queue UI drift).

## Production deploy

From repo root (Windows):

```powershell
$env:TIDAL_SSH_PASSWORD = "..."
# tar (default) or registry if DOCKERHUB_* set:
# $env:DEPLOY_MODE = "tar"
python scripts/deploy_tidal.py
```

Deploy builds frontend, ships `app.tar.gz`, rebuilds Docker on **46.17.102.157**, restarts caddy/api. Smoke: `https://flacaud.ru/healthz`.

After deploy: **Ctrl+Shift+R** in the browser. See [docs/DEPLOY.md](./docs/DEPLOY.md) for tar vs registry, Cloudflare, rollback.

## Required production env

See `.env.example`. Critical:

- `TIDALDLRU_JWT_SECRET`, `TIDALDLRU_SIGNING_SECRET`
- `DATABASE_URL` (Postgres)
- `TIDALDLRU_POOL_KEY` (Tidal account pool)

Optional: `SENTRY_DSN`, `RESEND_API_KEY`, YooKassa keys, `GEMINI_API_KEY` (bio / AI playlist). Artist portraits need **no** extra keys (`TIDALDLRU_ARTIST_IMAGE_CACHE_TTL` optional).

## Docs

| Doc | Contents |
|-----|----------|
| [docs/FEATURES.md](./docs/FEATURES.md) | Product + behavior reference (player, quality, portraits, radio, tests) |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | Production deploy playbook |
| [docs/PROJECT_SCORE.md](./docs/PROJECT_SCORE.md) | Quality scorecard |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design |
| [docs/SECURITY_AUDIT.md](./docs/SECURITY_AUDIT.md) | Security checklist |
| [ops/RUNBOOK.md](./ops/RUNBOOK.md) | On-call operations |
| [ops/SERVERS.md](./ops/SERVERS.md) | Hosts, DNS, Cloudflare, logs |

**HTML/PDF (full service doc):** `cd frontend && node ../docs/build_service_docs.mjs` → `docs/FlacAud-Service-Documentation.{html,pdf}`

## Repository

https://github.com/alexhenderson555/flacaud
