# HRMS — HR Management System

Phase 1 web HRMS for Provintell. Phase 2 SaaS, Phase 3 mobile.

See [`docs/superpowers/specs/2026-04-27-hrms-design.md`](docs/superpowers/specs/2026-04-27-hrms-design.md) for the full design.

## Quick start (dev)

Prerequisites: Docker, Docker Compose v2, GNU Make.

```bash
cp .env.example .env
make dev          # bring up the full stack
```

After ~30 seconds:

- API: http://localhost:8000/health/ready
- API docs: http://localhost:8000/api/v1/docs/
- Web: http://localhost:5173
- MinIO console: http://localhost:9001 (hrms / hrms-dev-secret)
- MailHog: http://localhost:8025

## Make targets

| Target | Effect |
|---|---|
| `make dev` | Start the full Docker stack |
| `make dev-down` | Stop and remove all dev containers |
| `make migrate` | Run Django migrations |
| `make test` | Run backend + frontend test suites |
| `make test-api` | Backend tests only |
| `make test-web` | Frontend tests only |
| `make contracts` | Regenerate OpenAPI + TS types |
| `make lint` | Run all linters |
| `make build` | Build production Docker images |

## Repository layout

```
apps/api          Django 5 + DRF backend
apps/web          React 18 + Vite frontend
packages/contracts  Generated OpenAPI + TS types (committed)
deploy            Docker Compose, nginx, prod overrides
docs              Specs, plans, ADRs, runbooks
```

## Contributing

1. Read the design spec.
2. Pick the next milestone plan from `docs/superpowers/plans/`.
3. Open a PR with the milestone in the branch name (e.g., `m1/identity-rbac`).

## License

Proprietary — Provintell.
