# Development & environments

A lightweight, no-extra-server setup for building features safely without
touching the live prod (which has paying users).

## Branches

| Branch | Role | Deploys? |
|---|---|---|
| `master` | **Production** (flacaud.ru) | **Yes** — push triggers GitHub Actions `deploy.yml` (CI `test` → SSH deploy). |
| `staging` | Integration / WIP | **No** — `deploy.yml` only triggers on `master`/`main`, so `staging` is a safe, non-deploying branch. |
| `feat/*` | One feature each | No |

**Flow:** `feat/x` → merge into `staging` (integrate + test locally) → when solid,
merge `staging` → `master` → `git push origin master` → prod auto-deploys.

Never commit straight to `master` for in-progress work. Hotfixes can go to
`master` directly, but prefer `staging` first.

## Local development (covers ~90% of feature work)

```bash
# 1. Redis (job queue / state)
docker compose up -d redis

# 2. Backend (FastAPI, hot reload)
uv sync
uv run uvicorn tidal_dl_ru.server.app:app --reload --port 8000

# 3. Frontend (Vite dev server, proxies /api → :8000)
cd frontend && npm install && npm run dev
```

- Copy `.env.example` → `.env` and fill the secrets (JWT, signing, bot token,
  pool key, YooKassa, etc. — see `docker-compose.yml` for the full list).
- **Tidal streaming/downloads** need network egress to `api.tidal.com`, which is
  geo-blocked from some regions. Route through your existing Marzban/VPN proxy
  (TUN mode, or set `HTTP_PROXY`/`HTTPS_PROXY`). **UI, recommendations, genres,
  library, lyrics** work fine without it.
- Or run the whole stack in Docker: `docker compose up --build` (no prod overlay).

## Feature flags

Ship in-progress features to prod **turned off**, enable them per-device for
dev/staging — see `frontend/src/utils/featureFlags.js`.

```js
import { isFeatureEnabled } from '../utils/featureFlags';
if (isFeatureEnabled('aiDj')) { /* render the new feature */ }
```

- Add the flag to `DEFAULTS` (keep it `false` for prod).
- Enable locally: browser console `__ff.enable('aiDj')`, or open with `?ff=aiDj`.
- `__ff.list()` shows the current state; overrides persist per browser.

This lets the big WIP features (AI DJ, continuous mix, …) live on `master`/prod
safely, hidden until ready.

## Before merging to `master` (what CI also runs)

```bash
# frontend
cd frontend && npm run lint && npx vitest run && npm run build
# backend
uv run ruff check src/ && uv run pytest -q
```

The `master` deploy is gated on these (`deploy.yml` job `deploy` `needs: test`),
so a red CI run will not reach prod.

> Note: after a deploy the PWA service worker may serve the old bundle — hard
> reload (Ctrl+Shift+R) to pick up the new one.
