# FlacAud — quality scorecard (living doc)

Last updated: **2026-06-17**. Honest ceilings for a solo-maintained lossless streaming product.

| Axis | Score | Notes |
|------|-------|-------|
| **Security** | **8.7** | IDOR/SSRF/GDPR/session hygiene. Artist bio requires auth (Gemini cost). Image proxy: DNS + public-IP check + CDN allowlist (Tidal, Wikimedia, Deezer, Apple). Residual: yt-dlp surface, set-analyzer URL fetch. |
| **Backend** | **8.8** | Artist portrait chain (no API keys); recommendation cover enrich; search errors narrowed; OpenAPI contract tests. Residual: broad handlers in worker hot paths. |
| **Frontend** | **8.8** | Quality UI matches delivered tier; streamRetryNonce on re-select; Genreverse cover keys; karaoke smooth scroll restored. Residual: 8 E2E specs drift vs player bar. |
| **UX / product** | **8.6** | Free artist portraits; genre radio distinct covers; K karaoke hotkey; mobile player 72px bar. Party hidden by choice. |
| **Testing** | **8.9** | **372** pytest; **282** vitest; Playwright **60** pass (full e2e green after UI/test sync). |
| **DevOps / CI** | **8.5** | pip-audit, npm audit, `deploy_tidal.py` tar/registry, E2E in CI. Residual: single-region, no canary. |
| **Performance** | **8.8** | PWA precache ~964 KiB (excludes three.js); search debounce 300 ms; transfer poll 300 ms; analyzer poll 1 s. |
| **Accessibility** | **8.5** | axe Playwright smoke; player/modal aria-labels. jsx-a11y blocked on ESLint 10. |
| **Documentation** | **9.0** | README, ARCHITECTURE, **FEATURES**, **DEPLOY**, SECURITY_AUDIT, RUNBOOK, SERVERS, scorecard, HTML/PDF generator. |
| **Observability** | **8.5** | Sentry, Prom/Loki/Grafana, client error POST. |

**Weighted overall: ~8.7 / 10** — structural ceiling (Tidal ToS, yt-dlp, solo ops) until canary deploy + E2E green + full a11y lint.

## Recent increments (2026-06)

1. **320k / quality switch** — `streamRetryNonce` on `changeQuality`; UI shows delivered tier when stable.
2. **Genreverse covers** — backend `_finalize_track_covers` + frontend enrich + img keys.
3. **Artist portraits** — Wikipedia → Deezer → iTunes → Tidal; 7d cache; no Google CSE.
4. **Karaoke** — smooth scroll/animations restored; API polls only sped up.
5. **Docs** — FEATURES.md, DEPLOY.md, expanded RUNBOOK/SERVERS/ARCHITECTURE.

## What would NOT move the needle

- Vanity 10/10 on every row
- WCAG AAA without dedicated QA
- Replacing yt-dlp / set-analyzer entirely

## Remaining increments toward 9.0

1. Fix **8 Playwright** specs (player bar, quality, queue, Genreverse, set-library) — **done 2026-06**
2. eslint-plugin-jsx-a11y (ESLint 9 pin or ESLint 10 support)
3. Blue/green or canary deploy
4. Narrow worker `except Exception` in hot download paths
5. More React component tests (player overlays, search UI)
