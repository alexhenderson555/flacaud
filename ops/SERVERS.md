# Production servers

| Role | Public URL | Host | Stack |
|------|------------|------|--------|
| **FlacAud** | **https://flacaud.ru** | `46.17.102.157` | `/opt/tidal-dl-ru`, `docker compose` |
| **VPN** (Marzban) | — | `151.243.177.88` | `/opt/marzban`, `docker compose` |

**Tidal host specs (checked 2026-06):** 6 vCPU (Xeon E5-2680 v2), **11 GB RAM**, **112 GB** disk. Load usually &lt; 0.5. Enough for current FlacAud traffic; watch **disk** and **egress** when scaling streams.

**Do not run Marzban on 46** — VPN lives on 151 only. If `marzban-marzban-1` appears on 46, stop/remove it there to avoid confusion (`docker stop marzban-marzban-1` on 46 only).

Do **not** deploy FlacAud on the VPN host.

On the tidal server set in `.env`:

```env
DOMAIN=flacaud.ru
TIDALDLRU_PUBLIC_API_BASE=https://flacaud.ru
TIDALDLRU_JWT_SECRET=<long-random-secret>
# optional: persistent lyrics cache (7-day TTL)
TIDALDLRU_LYRICS_CACHE=/var/lib/tidal-dl-ru/lyrics-cache
# optional: recommendation / AI playlist in-memory cache TTL (seconds)
TIDALDLRU_REC_CACHE_TTL=300
TIDALDLRU_AI_PLAYLIST_CACHE_TTL=600
# Artist portraits (Wikipedia → Deezer → iTunes → Tidal, no API keys)
# TIDALDLRU_ARTIST_IMAGE_CACHE_TTL=604800
# TIDALDLRU_WIKI_USER_AGENT=FlacAud/1.0 (https://flacaud.ru; artist portraits)
```

**Password reset email** (pick one):

```env
# Resend — https://resend.com (API key + verify flacaud.ru domain for noreply@)
RESEND_API_KEY=re_...
TIDALDLRU_EMAIL_FROM=FlacAud <noreply@flacaud.ru>
```

Or SMTP (`TIDALDLRU_SMTP_HOST`, `TIDALDLRU_SMTP_FROM`, …). Without either, forgot-password accepts the request but **no email is sent**. Deploy copies mail vars from your local `.env` to the server.

(`docker compose -f docker-compose.yml -f docker-compose.prod.yml` for TLS via Caddy.)

Caddy serves `frontend/dist` directly (`/assets/*` and SPA shell); only `/api/*` hits uvicorn. After deploy, restart `caddy` so it picks up new hashed JS/CSS.

**Library DJ columns** (`savedtrack.bpm`, `camelot_key`, `musical_key`): applied automatically on API startup for SQLite and Postgres (`ALTER TABLE … IF NOT EXISTS`). No manual migration needed after deploy.

**TLS / Cloudflare**

| CF proxy | Deploy env | Origin Caddy | Browser |
|----------|------------|--------------|---------|
| **OFF** (grey cloud) | `CLOUDFLARE_PROXY=0` (default) | `Caddyfile.le` → Let's Encrypt | **https://flacaud.ru** valid cert |
| **ON** (orange cloud) | `CLOUDFLARE_PROXY=1` | `Caddyfile.cloudflare` → `tls internal` | CF edge HTTPS; origin HTTP+:443 |

```bash
# DNS only + HTTPS on origin
python scripts/deploy_tidal.py

# Orange cloud (CF terminates TLS)
set CLOUDFLARE_PROXY=1
python scripts/deploy_tidal.py
```

CF SSL mode: **Full** (not Flexible). `auto_https disable_redirects` on origin avoids `308` loops.

**Laptop broken with CF proxy, OK on DNS-only:** almost always **bad CF cache** for `/assets/index-*.js` (~24 KB instead of ~650 KB). Fix: **Caching → Purge Everything**, or **Cache Rule**: `/assets/*` Bypass, `index.html` Bypass; or grey-cloud while testing. SPA shell now sends `Cache-Control: no-cache` on HTML.

**“Not secure” on DNS-only:** you deployed `Caddyfile.cloudflare` (self-signed origin). Redeploy with default (`CLOUDFLARE_PROXY` unset) so Caddy requests Let's Encrypt. Open **https://** not http.

**Covers & artist portraits without VPN:** frontend loads all remote art via **`/api/image-proxy`** (same origin). Server allowlist:

| Host suffix | Source |
|-------------|--------|
| `*.tidal.com`, `*.tidalcdn.com` | Tidal catalog |
| `*.wikimedia.org`, `*.wikipedia.org` | Wikipedia portraits |
| `*.dzcdn.net` | Deezer |
| `*.mzstatic.com` | Apple iTunes |

API field **`picture_source`**: `wikimedia` | `deezer` | `itunes` | `tidal` | `none`. See [docs/FEATURES.md](../docs/FEATURES.md) §3.

**Genre radio duplicate covers:** backend enriches per-track covers in `recommendations.py`; after deploy verify Genreverse shows distinct art per row.

## DNS (before first deploy to flacaud.ru)

Point **flacaud.ru** A record → `46.17.102.157`. Wait for propagation, then deploy.

## Logs on server

```bash
ssh root@46.17.102.157
cd /opt/tidal-dl-ru
docker compose logs -f api worker bot --tail 100
```

Auth events: `auth_login_ok`, `auth_login_failed`, `auth_register_*`. HTTP: `tidal_dl_ru.access` with `duration_ms`, `status`, `X-Request-Id`. Playback streams log as `stream track=… quality=… mode=…` where **mode** is `redirect` (true CDN range streaming), `dash_stream` (segments merged to disk, then byte-range seek), or `file`. Response header **`X-Stream-Mode`** mirrors the same value.

**DASH seek:** the API waits for the **full** cached file before the first response (no Range), so the player can scrub anywhere. Partial `.part` early responses used to limit seek to the first buffered slice.

**Metrics:** `GET https://flacaud.ru/api/metrics` — uptime + recommendation cache (`entries`, `active`, `ttl_sec`). Same cache stats are in `GET /healthz`.

**Download history (logged-in):** `GET /api/jobs/mine?limit=40` — recent download jobs; ZIP via `GET /api/jobs/{job_id}/zip`.

## Disk / Docker cleanup (tidal host)

Deploys accumulate **Docker build cache** (tens of GB). Routine fix:

```bash
export TIDAL_SSH_PASSWORD='...'
python scripts/optimize_server.py
```

Or on the server: `cd /opt/tidal-dl-ru && bash ops/server-maintenance.sh`

- Keeps **3 GB** of build cache, prunes dangling images, stale Vite assets, download jobs older than **14 days** (`jobs-data` volume).
- Each deploy also runs a light `docker builder prune` after `compose build`.

## Deploy FlacAud (flacaud.ru) — **does not touch VPN**

```bash
export TIDAL_SSH_PASSWORD='...'
python scripts/deploy_tidal.py
```

Or:

```bash
export DEPLOY_HOST=46.17.102.157
export DEPLOY_DOMAIN=flacaud.ru
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

## Internal paths (unchanged on prod)

Docker project name, volume paths (`/opt/tidal-dl-ru`, `flacaudio.db`), and `TIDALDLRU_*` env prefix stay as-is so existing data and secrets keep working after rebrand.
