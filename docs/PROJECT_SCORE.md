# FlacAud — quality scorecard (living doc)

Last updated: 2026-06-25. Honest ceilings for a solo-maintained lossless streaming product.

| Axis | Score | Notes |
|------|-------|-------|
| **Security** | **8.7** | IDOR/SSRF/GDPR/session hygiene. Artist bio requires auth (Gemini cost). Residual: yt-dlp surface. |
| **Backend** | **8.7** | Search errors narrowed; OpenAPI contract tests; outbound URL validation. Residual: some broad handlers in worker. |
| **Frontend** | **8.8** | apiClient, lazy chunks, stem splitter i18n, modal dialog roles. Residual: stream/blob fetch by design. |
| **UX / product** | **8.5** | Full feature set; stem splitter RU/EN; mobile player polish. Party hidden by choice. |
| **Testing** | **8.8** | 355+ pytest incl. OpenAPI contract; 272 vitest; axe a11y E2E; blocking Playwright. |
| **DevOps / CI** | **8.5** | pip-audit, npm audit, deploy script, E2E required. Residual: single-region, no canary. |
| **Performance** | **8.8** | PWA precache ~962 KiB (excludes three.js/video); lazy routes; manualChunks. |
| **Accessibility** | **8.5** | axe Playwright smoke (landing/terms/library); player/modal aria-labels. jsx-a11y still blocked on ESLint 10. |
| **Documentation** | **8.5** | README, SECURITY_AUDIT, RUNBOOK, this scorecard. |
| **Observability** | **8.5** | Sentry, Prom/Loki/Grafana, client error POST. |

**Weighted overall: ~8.7 / 10** — up from ~8.5; structural ceiling (Tidal, yt-dlp, solo ops) until canary deploy + full a11y lint.

## What would NOT move the needle

- Vanity 10/10 on every row
- WCAG AAA without dedicated QA
- Replacing yt-dlp / set-analyzer

## Remaining increments toward 9.0

1. eslint-plugin-jsx-a11y (ESLint 9 pin or wait for ESLint 10 support)
2. Blue/green or canary deploy
3. More React component tests (player overlays, search UI)
4. Narrow worker `except Exception` in hot download paths
