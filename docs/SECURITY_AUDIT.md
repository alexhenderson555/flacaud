# Security audit (FlacAud / tidal-dl-ru)

Last reviewed: 2026-06-15. Living checklist for production hardening.

## Auth & sessions

| Area | Status | Notes |
|------|--------|-------|
| JWT / session storage | OK | Tokens in httpOnly-style flow via existing auth; verify no tokens in URLs in new features |
| API auth on library routes | OK | `auth: true` on mutating client calls |
| CSRF on cookie auth | Review | If session cookies are added later, require CSRF tokens on POST |

## Input validation

| Area | Status | Notes |
|------|--------|-------|
| Search / playlist names | OK | Server trims and length-limits playlist names |
| Artist bio prompt | OK | Gemini prompt scoped to music; no user HTML in bio output (plain text) |
| Sync URL import | OK | URL normalized server-side; no open redirects in app routes |

## XSS

| Area | Status | Notes |
|------|--------|-------|
| Artist bio | Fixed | Wikipedia HTML removed; plain text from `/api/artist/{id}/bio` |
| Lyrics / user content | OK | Lyrics rendered as text nodes |
| `dangerouslySetInnerHTML` | Audit | Remaining uses should stay limited to sanitized sources |

## SSRF / outbound fetch

| Area | Status | Notes |
|------|--------|-------|
| Set analyzer URL fetch | Review | Server fetches user-supplied set URLs — ensure blocklist for internal IPs |
| Cover proxy | OK | Covers go through known CDN/proxy paths |

## Secrets

| Area | Status | Notes |
|------|--------|-------|
| `.env` in repo | OK | Not committed |
| Gemini / Tidal keys | OK | Server-side only |
| Client env | OK | No API secrets in frontend bundle |

## Rate limiting

| Area | Status | Notes |
|------|--------|-------|
| Downloads / search | Review | Confirm per-user daily limits enforced server-side |
| Artist bio (Gemini) | OK | TTL cache in `artist_bio_cache.py` reduces cost/abuse |

## Recommended next steps

1. Add integration test for artist bio endpoint (empty fallback, cache hit).
2. Block private IP ranges on set-analyzer remote URL fetch.
3. Security headers on nginx: `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`.
4. Periodic `npm audit` / `pip audit` in CI.

## Quick fixes applied in this pass

- Artist profile no longer loads arbitrary Wikipedia HTML into the DOM.
- Party mode and karaoke use fullscreen only on explicit user action.
- Auth strip on landing clarifies sign-in requirement before library features.
