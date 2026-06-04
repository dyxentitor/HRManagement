# HRMS — HR Management System

A web-based HR platform built for Provintell to run a company's day-to-day
people operations in one place: employees, leave, schedules, attendance, claims,
payroll, performance, training, and reporting — with role-based access,
encrypted personal data, and a full audit trail.

Built for Malaysia out of the box (`Asia/Kuala_Lumpur`, `en-MY`, MYR, statutory
leave rules, EPF/SOCSO/EIS/LHDN fields) and multi-tenant-ready underneath.

> **Roadmap:** Phase 1 (current) is the web app for own-office use. Phase 2 is
> multi-tenant SaaS; Phase 3 is mobile.

---

## What it does

| Area | What you can do |
|---|---|
| 👥 **Employees** | Directory with encrypted PII (IC, bank, tax IDs), profiles + photos, self-service edits, org/department/team structure |
| 🔐 **Access & security** | Role-based permissions (7 default roles, 110 permission codes), TOTP MFA, JWT sessions, append-only audit log |
| 🏖️ **Leave** | Balances + ledger, approval workflows, Malaysia statutory rules (annual/sick/hospitalization/maternity/paternity), year rollover + expiry |
| 🗓️ **Schedule & attendance** | Weekly/monthly roster grid, shifts, teams, clock in/out, holiday-replacement handling |
| 🧾 **Claims** | Expense claims with receipt attachments and amount-band approval tiers |
| 💸 **Payroll** | Payslips, payroll CSV export, tamper-evident hash-chained payroll ledger |
| 📈 **Performance** | KPI cycles with point-in-time snapshots |
| 🎓 **Training & certs** | Certifications and training records with 90/60/30-day expiry reminders |
| 🔔 **Notifications** | In-app + email digests with per-user preferences |
| 📊 **Dashboards & reports** | Role dashboards, a unified approvals inbox, and 15 reports (CSV/XLSX/PDF) |

Everything is permission-gated and module-toggleable per organization, so each
role only sees what it should.

---

## Tech stack

- **Backend** — Django 5 + Django REST Framework, Postgres 16, Redis, Celery
  (workers + beat), MinIO/S3 for files
- **Frontend** — React 18 + Vite + TypeScript + Tailwind, with a shadcn-based
  design system
- **Contracts** — OpenAPI schema generated from the API → TypeScript types
  (`packages/contracts`)
- **Runtime** — Docker Compose (dev and prod overlays)

---

## Getting started

### Fresh machine — one command

```bash
deploy/bootstrap.sh                    # interactive: checks deps → .env → stack → seed → verify
deploy/bootstrap.sh --help             # all options
deploy/bootstrap.sh --dev --seed=demo --yes   # unattended dev deploy
```

`bootstrap.sh` checks (and offers to install) missing dependencies, generates
`.env` with a fresh encryption key, brings the stack up, runs migrations, lets
you choose how much demo data to seed (full demo / logins only / nothing), and
verifies the result with a login smoke test. It's idempotent — safe to re-run.

Only hard requirement: **Docker + Docker Compose v2**. Everything else runs in
containers.

### Manual (if you prefer)

```bash
cp .env.example .env     # then set HRMS_FIELD_ENCRYPTION_KEY (see the file's note)
make dev                 # bring up the full stack
make migrate             # run migrations
make seed-provintell     # seed demo org + data
```

### Once it's up (~30s)

| Service | URL |
|---|---|
| Web UI | http://localhost:5173 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/api/v1/docs/ |
| MailHog (dev email) | http://localhost:8025 |
| MinIO console | http://localhost:9001 (`hrms` / `hrms-dev-secret`) |

**Demo logins** (when seeded with demo data) — password `Demo!2026`:

| Email | Role |
|---|---|
| `admin@provintell.demo` | Org Admin (full access) |
| `hr@provintell.demo` | HR Manager |
| `finance@provintell.demo` | Finance |
| `ops.lead@provintell.demo` / `eng.lead@provintell.demo` | Manager |
| `team.lead@provintell.demo` | Team Lead |
| `employee@provintell.demo` | Employee |
| `auditor@provintell.demo` | Auditor |

> ⚠️ **Back up `HRMS_FIELD_ENCRYPTION_KEY` from `.env` offline.** It encrypts all
> personal/financial data; losing it makes that data unrecoverable.

### Daily operations

```bash
./start.sh            # bring everything up
./start.sh status     # what's running
./start.sh logs api   # tail one service
./start.sh stop       # shut down (data is preserved)
```

---

## Common tasks

| Command | Effect |
|---|---|
| `make dev` | Start the full Docker stack |
| `make dev-down` | Stop and remove dev containers |
| `make migrate` | Run Django migrations |
| `make seed-provintell` | Seed the demo org + data |
| `make test` | Run backend + frontend test suites |
| `make test-api` / `make test-web` | One side only |
| `make lint` | Run all linters (ruff + biome + tsc) |
| `make contracts` | Regenerate OpenAPI schema + TS types |
| `make build` | Build production Docker images |

Run `make help` for the full list.

---

## Repository layout

```
apps/api             Django 5 + DRF backend (modules/, common/, hrms_api/)
apps/web             React 18 + Vite + TS frontend
packages/contracts   Generated OpenAPI schema + TS types (committed)
deploy               Docker Compose, nginx, prod overrides, bootstrap.sh
docs                 Specs, plans, audits, runbooks
References           Local-only ops notes (demo creds, prompts) — gitignored
```

`CLAUDE.md` is the operating manual: current version, change history, and the
conventions for working in this codebase.

---

## Contributing

1. Read `CLAUDE.md` (and the design spec it points to).
2. Branch with the scope in the name (e.g. `feat/leave-rollover`).
3. Keep changes additive and tested — `make lint` and `make test` must pass.
4. One logical change per commit (conventional prefixes: `feat`, `fix`, `docs`…).
5. Open a PR for review.

---

## License

Proprietary — Provintell.
