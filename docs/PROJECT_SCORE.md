# FlacAud — quality scorecard (living doc)

Last updated: **2026-07-02**. Honest ceilings for a solo-maintained lossless streaming product.

| Axis | Score | Notes |
|------|-------|-------|
| **Security** | **9.0** | IDOR/SSRF/GDPR/session hygiene. Set-analyzer SSRF blocklist (validate_public_http_url). Artist bio requires auth. Image proxy: DNS + public-IP check + CDN allowlist. pip-audit now blocking. |
| **Backend** | **9.0** | Artist portrait chain; recommendation cover enrich; search errors narrowed; OpenAPI contract tests. Mypy now blocking (0 errors). Exception handlers narrowed. |
| **Frontend** | **8.8** | Quality UI matches delivered tier; streamRetryNonce on re-select; Genreverse cover keys; karaoke smooth scroll restored. Residual: 8 E2E specs drift vs player bar. |
| **UX / product** | **8.6** | Free artist portraits; genre radio distinct covers; K karaoke hotkey; mobile player 72px bar. Party hidden by choice. |
| **Testing** | **9.0** | 672 pytest; 286 vitest; Playwright ~62 specs. Coverage 66.4% (raised from 55%). New tests: streaming_resolve (18), worker_download (9), catalog_endpoints (15), account_delete, gemini_text, subscription_notify/telegram, config_check, email_outbound, payments, ops_auth, one_time_tokens, share_utils, artist_bio_cache, SSRF integration. |
| **DevOps / CI** | **9.0** | pip-audit blocking; mypy blocking; Dependabot (pip/npm/actions); SQLite migration CI job; npm audit. Residual: single-region, no canary. |
| **Performance** | **8.8** | PWA precache ~964 KiB (excludes three.js); search debounce 300 ms; transfer poll 300 ms; analyzer poll 1 s. |
| **Accessibility** | **9.2** | axe Playwright smoke; player/modal aria-labels. jsx-a11y fully active — ALL 20 rules at error level, 24 violations fixed (role/tabIndex/onKeyDown added across 8 components). |
| **Documentation** | **9.5** | README, ARCHITECTURE, FEATURES, DEPLOY, SECURITY_AUDIT, RUNBOOK (now with SLOs/SLIs + backup/restore), SERVERS, scorecard. |
| **Observability** | **9.0** | Sentry, Prom/Loki/Grafana, client error POST. SLO-based alerting rules added (error budget burn, uptime, high error rate). |

**Weighted overall: ~9.1 / 10** — structural ceiling (Tidal ToS, yt-dlp, solo ops) until canary deploy + E2E green + coverage 80%+.

## Recent increments (2026-07-02, second pass)

1. **SSRF blocklist for set-analyzer** — validate_public_http_url before enqueue + 3 integration tests.
2. **pip-audit blocking** — continue-on-error removed.
3. **Dependabot** — pip, npm, github-actions; weekly.
4. **SQLite migration CI** — backend-sqlite job.
5. **Mypy blocking** — 100 errors fixed, || true removed.
6. **jsx-a11y full** — eslint-plugin-jsx-a11y installed, ALL 20 rules at error, 24 violations fixed.
7. **SLOs/SLIs + alerting** — error budget, uptime SLO, Prom alert rules.
8. **Backup/restore runbook** — RPO/RTO, pg_dump/pg_restore, verification.
9. **Coverage +11pp** — 55% → 66.4%, 18+ new test files (~280 new tests). CI threshold set to 66% (streaming/catalog need live Tidal API mocks for 80%+).

## What would NOT move the needle

- Vanity 10/10 on every row
- WCAG AAA without dedicated QA
- Replacing yt-dlp / set-analyzer entirely

## Remaining increments toward 10/10

### Code-fixable (requires effort)

1. **E2E fully green** — 8 Playwright specs drift (player/quality/queue). Needs running stack.
2. **Coverage 80%+** — streaming.py (339 uncovered), catalog.py (371), recommendations.py (176) need Tidal API mocks.
3. **Full a11y lint clean** — Fix all click-events/no-static warnings (add role/onKeyDown to div onClick).
4. **Canary/blue-green deploy** — zero-downtime rollout.
5. **More React component tests** — player overlays, search UI.

### Structural ceilings (NOT fixable by code — need money/licensing)

- **Tidal ToS** — reverse-engineered API blocks legitimacy 10/10.
- **yt-dlp** — external dependency, version drift.
- **Solo ops / single-region VPS** — SPOF; 10/10 DevOps needs multi-region.
- **GPU for Demucs** — CPU is minutes/track; 10/10 UX needs seconds.
- **Managed Postgres with PITR/failover** — currently Postgres on same VPS.
