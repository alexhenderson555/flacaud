# FlacAud — quality scorecard (living doc)

Last updated: 2026-06-25. Scores are honest ceilings for a solo-maintained lossless streaming product, not vanity 10/10.

| Axis | Score | Notes |
|------|-------|-------|
| **Security** | **8.5** | IDOR fixes, SSRF on URLs, rate limits, GDPR delete, session hygiene. Residual: yt-dlp surface, set-audio URL sharing. |
| **Backend** | **8.5** | FastAPI/ARQ/SQLModel solid; outbound URL validation; job ZIP hardened. Residual: broad exception handlers. |
| **Frontend** | **8.7** | apiClient on main flows; PartyMode + three.js lazy; dead LandingCanvas removed. Residual: stream/blob fetches by design. |
| **UX / product** | **8.0** | Full feature set; party hidden by choice. Stem splitter still English-only. |
| **Testing** | **8.5** | 351+ pytest, stream registry HTTP test, 267 vitest, E2E blocking. Residual: few component tests. |
| **DevOps / CI** | **8.5** | pip-audit, npm audit, deploy script, INFO logs default, E2E required. |
| **Performance** | **8.5** | vendor-three no longer on critical path; lazy routes, virtual lists, manualChunks. |
| **Accessibility** | **7.5** | Player overlay aria-labels, ArtistLine. jsx-a11y blocked on ESLint 10. |
| **Documentation** | **8.5** | README prod-accurate, SECURITY_AUDIT, ops/RUNBOOK. |
| **Observability** | **8.5** | Sentry wired, Prom/Loki/Grafana stack, client error POST. |

**Weighted overall: ~8.5 / 10** — practical maximum without rewriting scope (Tidal dependency, yt-dlp, single-region deploy).

## What would NOT move the needle

- Chasing literal 10/10 on all rows simultaneously
- Full WCAG AAA audit without dedicated QA
- Replacing yt-dlp/set-analyzer with a different product

## Next increments (if ever needed)

1. ~~Lazy-load `@react-three` only on Landing canvas mount~~ — PartyMode lazy; LandingCanvas removed
2. eslint-plugin-jsx-a11y when ESLint 9-compatible or project downgrades ESLint
3. Contract tests: API OpenAPI snapshot vs frontend types
4. Blue/green or canary deploy
