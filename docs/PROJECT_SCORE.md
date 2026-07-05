# FlacAud — quality scorecard (living doc)

Last updated: **2026-07-05**. Honest ceilings for a solo-maintained lossless streaming product.

| Axis | Score | Notes |
|------|-------|-------|
| **Security** | **9.0** | IDOR/SSRF/GDPR/session hygiene. Set-analyzer SSRF blocklist (validate_public_http_url). Artist bio requires auth. Image proxy: DNS + public-IP check + CDN allowlist. pip-audit now blocking on high/critical CVEs. |
| **Backend** | **9.2** | Artist portrait chain; recommendation cover enrich; search errors narrowed; OpenAPI contract tests. Mypy blocking (0 errors). catalog.py split (1237→514) + ai_playlist.py extracted. RadioClient Protocol decouples recommendations from TidalClient. Transition Finder endpoint with Camelot+BPM scoring. |
| **Frontend** | **9.0** | Quality UI matches delivered tier; streamRetryNonce on re-select; Genreverse cover keys; karaoke smooth scroll restored. Account.jsx split (1258→391) into 7 components. usePlaybackQuality helpers extracted. Stem Splitter replaced with Transition Finder. |
| **UX / product** | **8.8** | Free artist portraits; genre radio with junk-artist filter + real artist top tracks; K karaoke hotkey; mobile player 72px bar. Transition Finder replaces GPU-bound Stem Splitter (CPU seconds vs minutes). Party hidden by choice. |
| **Testing** | **9.2** | 715 pytest; 298 vitest; Playwright 59 specs fully green (was 8 drifting). Coverage 66% (raised from 55%). E2E now blocking in CI (was advisory). New: transitions (29), recommendation genre-seed (4), qualityProbeHelpers (10). |
| **DevOps / CI** | **9.3** | pip-audit blocking on high/critical; mypy blocking; Dependabot (pip/npm/actions); SQLite migration CI job; npm audit. deploy.yml hardened: rollback on health failure, SHA tagging, deployment summary. E2E blocking. Residual: single-region, no canary. |
| **Performance** | **8.8** | PWA precache ~1017 KiB (excludes three.js); search debounce 300 ms; transfer poll 300 ms; analyzer poll 1 s. Genre seed fetch parallelized via asyncio.gather. |
| **Accessibility** | **9.3** | axe Playwright smoke fully green; player/modal aria-labels. jsx-a11y fully active — ALL 20 rules at error level. Landing a11y fixed: aria-hidden-focus (tabIndex=-1 on mockup checkboxes) + aria-prohibited-attr (role="img" on compare spans). |
| **Documentation** | **9.5** | README, ARCHITECTURE, FEATURES, DEPLOY, SECURITY_AUDIT, RUNBOOK (with SLOs/SLIs + backup/restore), SERVERS, scorecard. |
| **Observability** | **9.0** | Sentry, Prom/Loki/Grafana, client error POST. SLO-based alerting rules (error budget burn, uptime, high error rate). |

**Weighted overall: ~9.2 / 10** — structural ceiling (Tidal ToS, yt-dlp, solo ops) until multi-region deploy + coverage 80%+.

## Recent increments (2026-07-05, fourth pass)

1. **Transition Finder** — replaced Stem Splitter (GPU-bound Demucs, minutes/track) with harmonic DJ transition recommender (Camelot + BPM scoring, CPU seconds). Backend: `transitions.py` + `/api/transitions` endpoint. Frontend: `TransitionFinder.jsx` page, sidebar/routing/palette updated. 29 backend tests.
2. **Genreverse seed quality** — junk-artist filter (content-farm/compilation names), `search_artists` + `get_artist_top_tracks` instead of track-search-by-name, 5 seeds instead of 3, parallel fetch. Fixed the "оч плохой подбор" issue.
3. **catalog.py split** — 1237→514 lines. AI playlist block (~700 lines) extracted to `ai_playlist.py`. App boots clean, all 19 catalog + 40 helper tests pass.
4. **Provider abstraction** — `RadioClient` Protocol in `recommendations.py`. All 8 function signatures use the Protocol; `TidalClient` only inside `_with_client()` factory. Second provider now pluggable without rewriting recommendations.
5. **Account.jsx split** — 1258→391 lines. 7 components extracted: ProfileCard, PlaybackQualityCard, DownloadHistoryCard, DjAnalysisCard, VisualizerCard, OfflineCacheCard, LanguageCard.
6. **usePlaybackQuality helpers** — `probeLosslessMeta` + `normalizeProbeResult` extracted to `qualityProbeHelpers.js` with 10 unit tests.
7. **E2E fully green** — 59 specs pass (was 8 drifting). Fixed: route shadowing (`page.unroute`), race conditions (listener-before-click), a11y violations (aria-hidden-focus, aria-prohibited-attr). E2E job now blocking in CI (was advisory).
8. **deploy.yml hardening** — rollback on health-check failure (60s retries, auto-revert to previous HEAD), SHA tagging (`deploy-<sha>`), deployment summary in GitHub UI. `environment: production` for deployment protection.
9. **pip-audit blocking** — fails on high/critical CVEs with fix available; low-severity transitive deps (torch, etc.) non-blocking. Two-step: report (continue-on-error) + severity gate.
10. **Coverage threshold** — raised from 65 to 66 in CI.
11. **Lyrics timeout** — reverted to 10s (was 22s).
12. **Commands button** — removed from sidebar (Ctrl+K hotkey still works).

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
