# FlacAud documentation index

| Document | Audience | Purpose |
|----------|----------|---------|
| [README.md](../README.md) | Everyone | Quick start, tests, deploy one-liner |
| [FEATURES.md](./FEATURES.md) | Dev / support | **Full feature & behavior reference** |
| [DEPLOY.md](./DEPLOY.md) | Dev / ops | Production deploy (tar vs registry, CF, rollback) |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Dev | High-level system design (RU) |
| [PROJECT_SCORE.md](./PROJECT_SCORE.md) | Maintainer | Quality scorecard |
| [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) | Security / ops | Hardening checklist |
| [LEGAL.md](./LEGAL.md) | Legal | Terms context |
| [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md) | Product | Roadmap notes |
| [ops/RUNBOOK.md](../ops/RUNBOOK.md) | On-call | Incidents, backups, metrics |
| [ops/SERVERS.md](../ops/SERVERS.md) | Ops | Hosts, DNS, env, logs |
| [FlacAud-Service-Documentation.html](./FlacAud-Service-Documentation.html) | Stakeholders | Generated full service doc |
| [FlacAud-Service-Documentation.pdf](./FlacAud-Service-Documentation.pdf) | Stakeholders | PDF export of above |

## Regenerate HTML/PDF

```bash
cd frontend && node ../docs/build_service_docs.mjs
```

Requires Playwright (installed with frontend devDependencies).

## Recent doc updates (2026-06-17)

- Artist portraits (Wikipedia → Deezer → iTunes → Tidal)
- Playback quality switch / UI tier sync
- Genre radio cover enrichment
- Test counts: pytest 372, vitest 282, e2e 52/8
- Deploy modes documented (tar vs registry)
