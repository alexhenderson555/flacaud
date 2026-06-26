# Security audit (FlacAud / tidal-dl-ru)

Last reviewed: **2026-06-17**. Living checklist for production hardening.

## Score snapshot (post-hardening pass)

Overall ~**7.8/10** (was ~6.2). Remaining gaps: set-analyzer SSRF blocklist, broader CSRF if cookie-only flows expand, periodic secret rotation runbook.

## Auth & sessions

| Area | Status | Notes |
|------|--------|-------|
| JWT access token storage | Fixed | Frontend uses `sessionStorage` only; legacy `localStorage` migrated once then cleared |
| Token refresh on 401 | Fixed | `apiClient` delegates to `apiFetchCore` with refresh + `credentials: include` |
| Password reset replay | Fixed | One-time consumption via Redis/memory (`one_time_tokens.py`); refresh sessions revoked on reset |
| Register password policy | Fixed | `UserCreate.password` min 8 chars server-side |
| Duplicate Tidal OAuth routes | Fixed | Unprotected `/api/auth/status|login|callback` removed from `api.py`; ops-gated versions in `auth.py` only |
| Account lifecycle | Fixed | `DELETE /api/auth/account` (password confirm), `GET /api/auth/export` GDPR export |

## Authorization (IDOR)

| Area | Status | Notes |
|------|--------|-------|
| Stream registry shortcut | Fixed | `/api/stream/...` and `/ready` use `get_downloaded_registry_for_owner(user.id)` |
| Transfer task polling | Fixed | Capability token `access_token` required on `GET /api/transfer/tasks/{id}` |

## Input validation

| Area | Status | Notes |
|------|--------|-------|
| `/api/recognize` | Fixed | Requires auth; audio/* only; 12 MB cap |
| Search query | Fixed | `SearchRequest.query` max 512 chars |
| Playlist / transfer URLs | OK | Existing length limits |

## XSS

| Area | Status | Notes |
|------|--------|-------|
| Artist bio | OK | Plain text from API |
| Lyrics / user content | OK | Text nodes |
| `dangerouslySetInnerHTML` | Audit | Keep limited to sanitized sources |

## SSRF / outbound fetch

| Area | Status | Notes |
|------|--------|-------|
| Set analyzer URL fetch | Review | Block private IP ranges on user-supplied URLs |
| Cover / portrait proxy | OK | `/api/image-proxy`: DNS public-IP check; allowlist Tidal CDN, Wikimedia/Wikipedia, Deezer (`dzcdn.net`), Apple (`mzstatic.com`). Artist fetch chain has no user-controlled URLs. |

## Secrets

| Area | Status | Notes |
|------|--------|-------|
| `.env` / keys in repo | OK | Not committed; `xray_config*.json` gitignored |
| Grafana default password | OK | `GRAFANA_ADMIN_PASSWORD` required in compose overlay |

## Rate limiting

| Area | Status | Notes |
|------|--------|-------|
| Auth refresh / payments / webhooks | Fixed | Added to `RATE_LIMITS` |
| Stream GET | Fixed | 120 req/min per IP pattern |
| Recognize / search / jobs | OK | Existing caps |

## Build & CI

| Area | Status | Notes |
|------|--------|-------|
| Production `console` stripping | Fixed | Vite `esbuild.drop` in production builds |
| `npm audit` in CI | Fixed | `--audit-level=high` on frontend job |

## Recommended next steps

1. Private-IP blocklist for set-analyzer remote URL fetch.
2. Integration test for stream registry owner isolation.
3. `pip audit` / Dependabot for Python deps.
4. Security headers already in `SecurityHeadersMiddleware` for production — verify behind Caddy.

## Quick fixes in 2026-06-17 pass

- Stream registry IDOR closed (owner-scoped registry on play/ready).
- Password reset single-use + session revoke; min password on register.
- Recognize auth + upload limits; transfer task capability tokens.
- Removed duplicate unprotected Tidal OAuth routes from `api.py`.
- GDPR delete/export endpoints; frontend token hygiene + sign-out cache clear.
- **Artist portraits:** removed Google CSE; outbound only to Wikipedia/Deezer/iTunes/Tidal with name matching; results cached 7d.
- **Image proxy:** expanded allowlist for portrait CDNs; SSRF blocks resolved private addresses.
- **Playback quality:** frontend reload on re-select same tier (prevents UI/stream mismatch).
