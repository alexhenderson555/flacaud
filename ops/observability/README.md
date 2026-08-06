# Observability (Prometheus + Loki + Grafana)

**Why Loki instead of Graylog:** on a single VPS Graylog needs OpenSearch (~2–4 GB RAM). Loki + Promtail ships Docker JSON logs into Grafana with far lower overhead. Metrics and logs live in one UI.

## Stack

| Service | Role |
|---------|------|
| **Prometheus** | Scrapes `/internal/metrics/prometheus` (api), node-exporter, alert rules |
| **Loki** | Log store (14-day retention) |
| **Promtail** | Tails Docker container stdout (JSON when `TIDALDLRU_LOG_FORMAT=json`) |
| **Grafana** | Dashboards + Explore (localhost only by default) |
| **node-exporter** | Host CPU/RAM/disk |

## Enable on server

1. In `.env`:

```bash
TIDAL_ENABLE_OBSERVABILITY=1
GRAFANA_ADMIN_PASSWORD=<strong-password>
# optional:
GRAFANA_ADMIN_USER=admin
GRAFANA_ROOT_URL=http://127.0.0.1:3000
```

2. Deploy as usual (`python scripts/deploy_tidal.py`) or on the server:

```bash
cd /opt/tidal-dl-ru
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.observability.yml up -d
```

3. Open Grafana via SSH tunnel:

```bash
ssh -L 3000:127.0.0.1:3000 root@46.17.102.157
# browser → http://127.0.0.1:3000
```

Dashboard: **FlacAud → FlacAud Overview**.

## What gets logged

| Source | Fields |
|--------|--------|
| HTTP access | `event=request` — method, path, **query** (secrets redacted), status, duration, IP, **username/user_id**, auth, user-agent, request_id |
| HTTP failures | `event=request_failed` + stack |
| Browser crashes | `event=client_error` |
| Auth | `auth_login_ok` / `auth_login_failed` with username |
| Frontend perf | `component="perf"` (e.g. `metric:login_interactive_ms=...`) via `/api/client-errors` |

Default **`TIDALDLRU_LOG_LEVEL=DEBUG`** on api/worker/bot. Noisy modules (lyrics, recommendations) stay at INFO unless `TIDALDLRU_DEBUG_VERBOSE=1`.

**Find a user in Loki:**
```
{service="api"} | json | username="their_login"
{service="api"} | json | user_id="123"
```

Set `TIDALDLRU_LOG_FORMAT=json` (default in `docker-compose.yml`).

## Prometheus alerts

Rules: `ops/prometheus/alerts.yml` (health, disk, stream errors, Tidal pool).

Reload after edit:

```bash
docker compose exec prometheus kill -HUP 1
```

**Gotcha after a tar-mode deploy:** `scripts/deploy_tidal.py` extracts a fresh tarball on the server, which replaces `alerts.yml` with a **new inode** rather than editing it in place. A `prometheus` container that was already running keeps the bind-mount pointed at the old inode, so `kill -HUP 1` reloads `prometheus.yml` but silently keeps serving the stale `alerts.yml` (verify with `docker compose exec prometheus wc -l /etc/prometheus/alerts.yml` vs the file on disk). Fix: `docker compose restart prometheus` (not just kill -HUP) after any deploy that touches `alerts.yml`.

## Optional: public Grafana subdomain

Do **not** expose Grafana without auth. If needed, add a Caddy vhost with basic auth and set `GRAFANA_ROOT_URL=https://monitor.example.com`.

## Client errors without Sentry

Frontend always POSTs to `/api/client-errors` (rate-limited). Sentry remains optional via `VITE_SENTRY_DSN` at build time.

## Resource budget

~512 MB–1 GB RAM for Loki + Prometheus + Grafana. Skip observability compose on very small VMs.
