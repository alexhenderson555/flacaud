# FlacAud — деплой в production

Last updated: **2026-06-17**. Прод: **https://flacaud.ru**, хост **46.17.102.157**, путь **`/opt/tidal-dl-ru`**.

**VPN (Marzban) живёт только на 151.x** — не деплоить FlacAud туда и не вызывать `repair_servers.py` для рутинного релиза.

---

## 1. Что происходит при деплое

1. Локально: `npm run build` в `frontend/` → `frontend/dist/`.
2. `make_tar.py` → `app.tar.gz` (dist + исходники; при tar-mode ещё build context).
3. SCP на сервер → `tar -xzf` в `/opt/tidal-dl-ru`.
4. `docker compose build` (api, worker, bot) + `up -d`.
5. Restart **caddy** (подхватить новые hashed assets), api, bot.
6. Smoke: `https://flacaud.ru/healthz`, `https://flacaud.ru/api/providers`.

Tar-деплой шипит **текущее рабочее дерево**, не обязательно последний коммит в `origin/master`.

---

## 2. Режимы: `tar` vs `registry`

Задаётся **`DEPLOY_MODE`** или авто в `scripts/repair_servers.py` / `deploy_tidal.py`:

| Режим | Когда | Поведение |
|-------|--------|-----------|
| **`tar`** (default без Docker Hub) | Нет `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` | Архив на сервер, **сборка образов на VPS** |
| **`registry`** | Есть Docker Hub creds | Push образов `flacaud-api/worker/bot`, pull на сервере |

`.env.example`:

```env
# DEPLOY_MODE=registry|tar
# DOCKERHUB_USERNAME=
# DOCKERHUB_TOKEN=
# FLACAUD_TAG=latest
```

Локально (Windows PowerShell):

```powershell
$env:TIDAL_SSH_PASSWORD = "..."
# опционально:
# $env:DEPLOY_MODE = "tar"
python scripts/deploy_tidal.py
```

Linux/macOS:

```bash
export TIDAL_SSH_PASSWORD='...'
python scripts/deploy_tidal.py
```

Альтернатива с явным хостом: `scripts/deploy.py` + `DEPLOY_HOST`, `DEPLOY_PATH`.

---

## 3. Предусловия

### На машине разработчика

- Python 3.11+, `uv` или venv
- Node 20+, `cd frontend && npm ci`
- SSH/SCP к серверу (пароль в `TIDAL_SSH_PASSWORD` или ключ `DEPLOY_SSH_KEY`)

### На сервере

- Docker + Compose v2
- `.env` с секретами (не перетирать при деплое — скрипт мержит критичные vars)
- DNS **flacaud.ru** → `46.17.102.157`
- Tidal pool: `TIDALDLRU_POOL_KEY`, аккаунты в pool.db

### Обязательные prod secrets

```env
TIDALDLRU_ENV=production
TIDALDLRU_JWT_SECRET=...
TIDALDLRU_SIGNING_SECRET=...
DATABASE_URL=postgresql+psycopg://...
TIDALDLRU_POOL_KEY=...
DOMAIN=flacaud.ru
TIDALDLRU_PUBLIC_API_BASE=https://flacaud.ru
```

См. `.env.example` и [ops/SERVERS.md](../ops/SERVERS.md).

---

## 4. Compose overlays

```bash
# TLS (Caddy + Let's Encrypt)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Postgres
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d

# Observability (Prometheus + Loki + Grafana)
TIDAL_ENABLE_OBSERVABILITY=1 GRAFANA_ADMIN_PASSWORD=... 
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

---

## 5. Cloudflare

| Прокси | Env при деплое | Caddyfile |
|--------|----------------|-----------|
| DNS only (серый) | `CLOUDFLARE_PROXY=0` | `Caddyfile.le` → Let's Encrypt |
| Orange cloud | `CLOUDFLARE_PROXY=1` | `Caddyfile.cloudflare` → internal TLS |

CF SSL mode: **Full**. После деплоя при orange cloud — **Purge Everything** если `/assets/index-*.js` отдаётся урезанным (~24 KB).

---

## 6. Проверка после деплоя

```bash
curl -s https://flacaud.ru/healthz | jq
curl -s https://flacaud.ru/api/providers | head
```

На сервере:

```bash
ssh root@46.17.102.157
cd /opt/tidal-dl-ru
docker compose ps
docker compose logs api --tail 50
docker compose logs caddy --tail 20
```

В браузере: **Ctrl+Shift+R**. Проверить: логин, стрим, смена качества, Genreverse обложки, портрет артиста.

---

## 7. Откат

```bash
export ROLLBACK_TAG=<previous-tag>
python scripts/rollback_tidal.py
```

Или вручную на сервере: зафиксировать `FLACAUD_TAG` в `.env`, `docker compose pull && up -d`.

Откат **dist** без образов: `scripts/rollback_jun18_dist.py` / restore scripts — только при аварии фронта.

---

## 8. Обслуживание диска

Деплои копят Docker build cache (десятки GB):

```bash
python scripts/optimize_server.py
# или на сервере:
bash ops/server-maintenance.sh
```

Cron backup: `ops/backup-db.sh` (см. [RUNBOOK.md](../ops/RUNBOOK.md)).

---

## 9. Миграции БД

Схема через **Alembic**. На старте API: `alembic upgrade head`. Legacy DB: auto `stamp head`.

```bash
make migrate
uv run alembic current
```

---

## 10. CI vs ручной деплой

GitHub Actions (если включён): ruff + pytest, frontend lint + vitest + e2e, затем CD по SSH.

Ручной `deploy_tidal.py` дублирует CD с dev-машины — удобно когда CI не гонялся или нужен hotfix из локального дерева.

---

## 11. Troubleshooting

| Симптом | Действие |
|---------|----------|
| 502 после deploy | Подождать 30 s, `docker compose logs api` |
| Старый JS в браузере | Hard refresh; CF purge `/assets/*` |
| «Not secure» DNS-only | Передеплой с `CLOUDFLARE_PROXY=0`, открывать https:// |
| Стрим 401 | Re-login; проверить `mt` token / JWT secret rotation |
| Портреты пустые | Логи api, Wikipedia rate limit; проверить image-proxy allowlist |
| Worker stuck | `docker compose logs worker`, `redis-cli ping` |

Инциденты: [ops/RUNBOOK.md](../ops/RUNBOOK.md).
