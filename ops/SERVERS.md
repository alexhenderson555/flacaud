# Production servers

| Role | Public URL | Host | Stack |
|------|------------|------|--------|
| **tidal-dl-ru** (FlacAudio) | **https://proshli.ru** (also `app.proshli.ru`) | `46.17.102.157` | `/opt/tidal-dl-ru`, `docker compose` |
| **VPN** (Marzban) | — | `151.243.177.88` | `/opt/marzban`, `docker compose` |

Do **not** deploy tidal-dl-ru on the VPN host.

On the tidal server set in `.env`:

```env
DOMAIN=proshli.ru
TIDALDLRU_PUBLIC_API_BASE=https://proshli.ru
```

(`docker compose -f docker-compose.yml -f docker-compose.prod.yml` for TLS via Caddy.)

Caddy serves `frontend/dist` directly (`/assets/*` and SPA shell); only `/api/*` hits uvicorn. After deploy, restart `caddy` so it picks up new hashed JS/CSS.

**Cloudflare:** `ops/Caddyfile` uses `auto_https disable_redirects` + `tls internal` on :443 so CF **Full** can reach origin without a `308` redirect loop. (`auto_https off` would also disable the internal cert → CF `525`.) Do not use **Flexible** + origin HTTPS redirects. For **Full (strict)** install a Cloudflare Origin Certificate on the server.

## Logs on server

```bash
ssh root@46.17.102.157
cd /opt/tidal-dl-ru
docker compose logs -f api worker bot --tail 100
```

Auth events: `auth_login_ok`, `auth_login_failed`, `auth_register_*`. HTTP: `tidal_dl_ru.access` with `duration_ms`, `status`, `X-Request-Id`.

## Deploy tidal only (proshli.ru) — **does not touch VPN**

```bash
export TIDAL_SSH_PASSWORD='...'
python scripts/deploy_tidal.py
```

Or:

```bash
export DEPLOY_HOST=46.17.102.157
export DEPLOY_USER=root
export DEPLOY_PASSWORD='...'
python scripts/deploy.py
```

**Never** run `repair_servers.py` for routine deploys — it used to restart Marzban and drop VPN.

## VPN maintenance only (151) — manual, rare

```bash
export VPN_SSH_PASSWORD='...'
export VPN_FIX=1
python scripts/repair_servers.py
```
