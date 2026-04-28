# HRMS M9–M12 Milestone Roadmap

**Purpose:** Scope-lock the final four milestones (Notifications UX, Dashboards/Approvals Inbox, Reports, Hardening+Launch). Per-milestone detailed step-by-step plans authored on demand right before execution (same cadence as M3a/M3b/M5a/etc.).

**State at start of M9:** 9 milestones shipped (`v0.1.0-m{0..8}`). 94 permission codes. ~380 backend tests + ~10 frontend. All major HR features functional end-to-end.

---

## M9 — Notifications UX Finalization

**Spec reference:** spec §3 (`notifications`, `notification_preferences`), §4 (`/notifications/*`), §7 (notification UI patterns).

**Goal:** Make the notification system actually visible in the UI. Backend infrastructure (`notifications` table, `Notification.create_for_user(...)` helper, modules emitting events) shipped in M1; M9 finalizes the user-facing surface — top-bar bell, slide-over panel, preferences page, email batching/digest.

### What already exists (from M1+)

- `notifications` table — every module already writes rows on consequential events (leave approved, claim submitted, KPI cycle opens, cert expiring, etc.)
- `notification_preferences` table stub — user × type × channel matrix
- Email dispatch via Django's `send_mail` (synchronous in M1; M9 makes it batched)

### Data model additions

```
-- Add columns if not already present:
notifications.read_at TIMESTAMPTZ NULL          (already in M1)
notifications.deep_link VARCHAR(500) BLANK      (NEW — frontend route to navigate on click)
notifications.priority VARCHAR(8) DEFAULT 'normal'  (NEW — 'low'|'normal'|'high'|'urgent')

notification_preferences(user_id, type, channel, enabled BOOLEAN)
                         (already in M1 — populate defaults on user create via signal)

email_digest_runs(id, org_id, user_id, sent_at, notification_ids[]) NEW
                  -- audit of batched email sends (one row per user per digest)
```

### API endpoints (mostly already exist; M9 finalizes)

```
GET    /api/v1/notifications?unread_only=true&cursor=
PATCH  /api/v1/notifications/{id}/read
POST   /api/v1/notifications/read-all
GET    /api/v1/notifications/preferences
PATCH  /api/v1/notifications/preferences          (single record at a time, or bulk array)
```

### File structure

```
apps/api/modules/notification/                  (already exists from M1; modify)
├── models.py                                    + deep_link, priority, EmailDigestRun
├── services/
│   ├── notify.py                                already there
│   ├── digest.py                                NEW — batched email sender
│   └── preferences.py                           NEW
├── tasks.py                                     NEW — Celery: send_pending_email_digests (hourly)
├── signals.py                                   already; add default-preferences-on-create
└── tests/

apps/web/src/components/                        (top bar + bell)
├── NotificationBell.tsx                        NEW
├── NotificationPanel.tsx                       NEW (slide-over)
└── shell/TopBar.tsx                            MODIFY — embed NotificationBell

apps/web/src/modules/notifications/             NEW
├── api.ts, routes.tsx
└── pages/PreferencesPage.tsx
```

### Sub-plans

- **M9 (single combined plan)** — ~5 tasks:
  1. Backend additions: deep_link/priority columns, EmailDigestRun model, default-preferences signal
  2. Digest service + Celery hourly task `send_pending_email_digests` (groups all unread non-read in-app notifications since last digest into one email)
  3. Endpoints: confirm preferences GET/PATCH work for bulk updates; ensure read/read-all endpoints exist
  4. Frontend: NotificationBell + NotificationPanel + PreferencesPage; embed bell in TopBar
  5. CHANGELOG + tag `v0.1.0-m9` + merge

### Acceptance criteria

- [ ] Top-bar bell shows unread count (polling every 60s or SSE upgrade)
- [ ] Click bell → slide-over panel grouped Today / Yesterday / Older
- [ ] Click notification row → navigate to `deep_link` and mark read
- [ ] "Mark all read" button works
- [ ] Preferences page renders per-type × per-channel toggles; security types (login alerts, MFA changes) non-disablable
- [ ] Hourly Celery task batches unread notifications into one email per user
- [ ] Backend test count grows by ~15
- [ ] Frontend test count grows by ~5
- [ ] Permission catalogue grows by ~3 (`notification:read:self`, `notification:preferences:write:self`, `notification:digest:read:org`) → 97

---

## M10 — Dashboards + Unified Approvals Inbox

**Spec reference:** spec §4 (`/dashboards/{me,team,admin}`, `/approvals/inbox`), §7 (dashboard cards pattern).

**Goal:** Bring the modules together. A single approvals inbox that merges leave + claims + (future KPI cycle review nudges) so managers don't have three different "approval queues". Role-aware dashboards composed of small, reusable cards that each fetch their own data via TanStack Query.

### Data model

No new tables. `/approvals/inbox` is a server-side merge of `LeaveRequest(status=submitted)` + `ClaimRequest(status in {submitted, manager_approved})` filtered by approver. `/dashboards/*` are read-models (queries against existing tables).

### API endpoints

```
GET    /api/v1/approvals/inbox                  unified queue for the current user
                                                 returns [{kind, id, summary, submitted_at, ...}, ...]
                                                 kind ∈ {leave, claim}
GET    /api/v1/dashboards/me                    employee landing
GET    /api/v1/dashboards/team                  manager landing (direct reports)
GET    /api/v1/dashboards/admin                 hr_manager / org_admin landing
```

Each dashboard endpoint returns a `cards: [{type, data}, ...]` payload. Cards are role-filtered server-side.

### Card catalogue (Phase 1)

| Card type | Roles | Data source |
|---|---|---|
| `pending_approvals_self_as_manager` | manager+ | `/approvals/inbox` count |
| `my_leave_balance` | employee+ | `/leave/balances/me` |
| `upcoming_holidays` | all | `/schedule/holidays?year=current` |
| `certs_expiring_team` | manager+ | `/certifications?expiring_within_days=60&scope=team` |
| `kpi_cycle_progress_team` | manager+ | `/kpi/team-summary?cycle=active` |
| `today_attendance_team` | manager+ | `/attendance/team?date=today` |
| `recent_claims_self` | employee+ | `/claims?scope=self&limit=5` |
| `birthdays_this_month` | all | `/employees?birthday_month=current` |

### File structure

```
apps/api/modules/dashboard/                     NEW
├── __init__.py, apps.py
├── services/
│   ├── inbox.py                                merge leave + claims
│   ├── cards/                                  one file per card type
│   │   ├── pending_approvals.py
│   │   ├── my_leave_balance.py
│   │   └── ...
│   └── role_filter.py                          which cards for which role
├── views.py, urls.py
└── tests/

apps/web/src/modules/dashboard/                 NEW
├── api.ts, routes.tsx
├── pages/DashboardPage.tsx                     role-aware (uses /dashboards/{role}/me)
└── components/cards/                           one component per card type
    ├── PendingApprovalsCard.tsx
    ├── LeaveBalanceCard.tsx
    └── ...

apps/web/src/modules/approvals/                 NEW (merges with M3d/M5b inboxes)
├── api.ts, routes.tsx
└── pages/UnifiedInboxPage.tsx
```

### Sub-plans

- **M10 (single combined plan)** — ~6 tasks:
  1. `/approvals/inbox` backend service merging leave + claims for current user
  2. Card catalogue backend (8 cards, each ~30 lines)
  3. `/dashboards/{me,team,admin}` endpoints with role-filtered card lists
  4. Frontend `UnifiedInboxPage` (replaces M3d's `/leave/approvals` and M5b's `/claims/finance` queues — retire those routes or alias them)
  5. Frontend `DashboardPage` (renders cards for the user's role); each card is a small component with its own TanStack Query
  6. CHANGELOG + tag `v0.1.0-m10` + merge

### Acceptance criteria

- [ ] Manager opens `/approvals` → sees both leave AND claims in one list, sorted by `submitted_at`
- [ ] Click row → drawer with full detail + Approve/Reject (kind-specific endpoints called)
- [ ] Employee landing page shows: leave balance + my claims + upcoming holidays + birthdays this month
- [ ] Manager landing adds: pending approvals count, team attendance today, certs expiring team
- [ ] HR landing adds: org-wide stats
- [ ] Old `/leave/approvals` and `/claims/finance` routes redirect to `/approvals` (or remain as deep-links)
- [ ] Backend +12 tests; frontend +6 tests
- [ ] Permission catalogue grows by ~2 (`dashboard:read:{me,team,admin}`) → ~99

---

## M11 — Reports (12 standard + 3 HR-ops, registry-driven)

**Spec reference:** spec §5b (Report registry), §4 (`/reports/*` endpoints).

**Goal:** Generic Report registry: each report = a Python class with `code, title, columns, queryset_fn, exporters, default_filters`. Single frontend page that introspects the registry and renders filters + table + export buttons. 15 reports registered (12 standard + 3 HR-ops per spec §5b).

### Architecture

Each module registers its reports in `<module>/reports.py`:

```python
# apps/api/modules/leave/reports.py
from common.reporting import Report, register

@register
class LeaveBalanceSummary(Report):
    code = "leave.balance_summary"
    title = "Leave balance summary"
    permissions = ["leave:balance:read:self"]
    columns = [
        {"field": "employee_code", "label": "Employee"},
        {"field": "leave_type_code", "label": "Type"},
        {"field": "entitled", "label": "Entitled"},
        {"field": "available", "label": "Available"},
    ]
    filters = [
        {"field": "dept", "type": "select", "source": "/api/v1/departments/"},
        {"field": "leave_type", "type": "select", "source": "/api/v1/leave/types/"},
        {"field": "as_of_date", "type": "date"},
    ]
    exporters = ["csv", "xlsx", "pdf"]

    @classmethod
    def queryset(cls, filters, user):
        # Returns a queryset; framework paginates + serializes via columns
        ...
```

### Data model

```
saved_views(id, user_id, report_code, filters JSONB, name, created_at)
            -- per-user saved filter combos
report_export_jobs(id, user_id, report_code, filters, format, status, s3_key NULL, error TEXT)
                   -- async export tracking
```

### API endpoints

```
GET    /api/v1/reports                         list all reports visible to user
GET    /api/v1/reports/{code}/schema           filter spec for the UI to render
POST   /api/v1/reports/{code}/run              {filters, page, page_size} → paginated rows
POST   /api/v1/reports/{code}/export           {filters, format} → 202 + job_id
GET    /api/v1/reports/jobs/{job_id}           poll status, on done returns signed S3 URL
GET    /api/v1/reports/saved-views?code=
POST   /api/v1/reports/saved-views
DELETE /api/v1/reports/saved-views/{id}
```

### File structure

```
apps/api/common/reporting/                     NEW
├── __init__.py
├── registry.py                                 Report base class, @register decorator
├── exporters/
│   ├── __init__.py
│   ├── csv_exporter.py
│   ├── xlsx_exporter.py                        openpyxl
│   └── pdf_exporter.py                         ReportLab (already used in M6)
├── tasks.py                                    Celery: run_export
└── tests/

apps/api/modules/<each>/reports.py             NEW per module that contributes reports

apps/api/modules/reporting/                    NEW (the public viewset)
├── __init__.py, apps.py
├── models.py                                   SavedView, ReportExportJob
├── views.py                                    list, schema, run, export, jobs, saved-views
├── urls.py
└── tests/

apps/web/src/modules/reports/                  NEW
├── api.ts, routes.tsx
└── pages/{ReportsListPage, ReportRunPage}.tsx
```

### 15 reports to register (per spec §5b)

| # | Code | Module | Title |
|---|---|---|---|
| 1 | `leave.balance_summary` | leave | Leave balance summary |
| 2 | `leave.taken_period` | leave | Leave taken (period) |
| 3 | `leave.pending_approvals` | leave | Pending leave approvals |
| 4 | `attendance.daily_summary` | attendance | Daily attendance summary |
| 5 | `attendance.late_absent_log` | attendance | Late/absent log |
| 6 | `attendance.hours_worked` | attendance | Hours worked (period) |
| 7 | `claims.pending_by_approver` | claims | Pending claims by approver |
| 8 | `claims.spend_by_category` | claims | Claims spend by category |
| 9 | `claims.reimbursement_status` | claims | Reimbursement status |
| 10 | `kpi.cycle_progress` | kpi | KPI cycle progress |
| 11 | `cert.expiring_soon` | certification | Certifications expiring |
| 12 | `headcount.snapshot` | employee | Headcount snapshot |
| HR-ops | `hrops.probation_ending` | employee | Probation ending soon |
| HR-ops | `hrops.contract_ending` | employee | Contract ending soon |
| HR-ops | `hrops.birthdays_this_month` | employee | Birthdays this month |

### Sub-plans

- **M11a — Reporting framework** — ~3 tasks:
  1. `common/reporting/` package: Report base, @register, registry singleton, schema introspection
  2. Exporters (csv, xlsx, pdf) + Celery task `run_export`
  3. `SavedView`, `ReportExportJob` models + endpoints
- **M11b — Register 15 reports** — ~3 tasks:
  1. Register 5 leave + attendance reports
  2. Register 4 claims + KPI + certification reports
  3. Register 3 HR-ops reports + 1 headcount
- **M11c — Frontend + tag** — ~2 tasks:
  1. ReportsListPage + ReportRunPage (introspects schema, renders filters + table + export)
  2. Saved-views + CHANGELOG + tag `v0.1.0-m11`

### Acceptance criteria

- [ ] All 15 reports listed at `/reports`
- [ ] Each report has correct columns + filters declared
- [ ] CSV export works synchronously for small results; XLSX/PDF go through Celery for large
- [ ] User can save/restore filter combos
- [ ] Permission gating: each report has its own perm code; `report:run:<code>` and `report:export:<code>` auto-derived
- [ ] Backend +25 tests; frontend +5
- [ ] Catalogue grows by ~30 codes (~2 per report) → ~129

---

## M12 — Hardening + Provintell Launch Prep

**Spec reference:** spec §8 (testing/CI/observability/security), §9 (definition of "Phase 1 done"), §1 (locked decisions).

**Goal:** No new features. Make the system production-ready for Provintell to actually use. Backup verification, monitoring dashboards, alert rules, runbook, real seed data, parallel-run validation.

### Sub-plans

- **M12a — Backup + monitoring** — ~3 tasks:
  1. Backup verification job (weekly cron — restore latest pg_dump to a temp container, run smoke checks: row counts, hash chain head verification, signed S3 URL fetches a known PDF)
  2. Grafana dashboards: API health, DB, Celery, Auth, Business — committed as JSON to `deploy/grafana/`
  3. Prometheus alert rules (Phase 1 set per spec §8) — committed to `deploy/prometheus/rules.yml`

- **M12b — Runbook + Provintell seed** — ~3 tasks:
  1. `docs/runbooks/` — deploy, rollback, restore-from-backup, key rotation, payroll-ledger verification
  2. `make seed-provintell` — real Provintell seed (1 org, 3 depts, 8 employees, 2 shifts, 30 days attendance, MY public holidays, leave types/balances accrued, sample claims, sample KPI cycle, sample certs)
  3. Demo accounts table + scrub-on-prod flag

- **M12c — Parallel run + Phase-1-done** — ~3 tasks:
  1. **Phase 1 acceptance smoke** — run a 2-week parallel run alongside Provintell's existing process: HR uses HRMS for new leave/claim/KPI submissions; existing process continues for legacy items; reconcile at end of week 2
  2. Define-of-done checklist (per spec §9): ALL boxes ticked
  3. CHANGELOG `[1.0.0] - <ship date>`, tag `v1.0.0` (NOT `v0.1.0-m12` — this is Phase 1 release), merge

### File structure

```
deploy/
├── grafana/dashboards/*.json                  NEW
├── prometheus/rules.yml                       NEW
├── backups/restore-verify.sh                  NEW
└── seed/provintell.py                         NEW (Django script invoked by make seed-provintell)

docs/runbooks/                                 NEW
├── README.md
├── deploy-staging.md
├── deploy-prod.md
├── rollback.md
├── restore-from-backup.md
├── rotate-encryption-keys.md
└── verify-payroll-ledger.md

apps/api/modules/<each>/management/commands/seed_provintell_*.py  (per-module seed scripts)
```

### Acceptance criteria — Phase 1 done (per spec §9)

- [ ] All M0–M12 milestones meet their acceptance criteria
- [ ] Provintell's actual employees migrated (real data, not demo seed)
- [ ] At least one full leave cycle executed against production data (apply → approve → balance update → notification)
- [ ] At least one full claim cycle executed (submit → manager → finance → reimburse)
- [ ] At least one KPI cycle initiated
- [ ] Backup + restore tested end-to-end against production data
- [ ] Monitoring dashboards green for ≥ 7 days; alerts wired and tested with synthetic incidents
- [ ] Provintell HR signed off after a 2-week parallel run alongside their existing process
- [ ] Tag `v1.0.0` (not `v0.1.0-m12`) — graduating from milestone-tag scheme

---

## Combined acceptance after M12

- [ ] All 13 milestones (M0–M12) on master with annotated tags
- [ ] Final tag `v1.0.0`
- [ ] Backend test count ~430+
- [ ] Frontend test count ~25+
- [ ] Permission catalogue ~129 codes
- [ ] All cron jobs registered + monitored
- [ ] Runbook covers deploy, rollback, restore, key rotation
- [ ] Provintell HR signed off
- [ ] **HRMS Phase 1 production-ready**

---

## Sequencing notes

- **M9 is the smallest** — backend infra exists; mostly ~1 plan of mainly-frontend work.
- **M10 is medium** — needs to gracefully replace M3d/M5b's separate inbox routes; consolidation matters more than new code.
- **M11 has the most code** — 15 reports + framework + frontend. Split into 3 sub-plans to keep each tractable.
- **M12 is operational** — fewer code changes, more docs/configs/scripts. The 2-week parallel run is the longest single timebox.

After M12, **HRMS Phase 1 is production-shipped**. Phase 2 (SaaS subscriptions, billing, plan-gating) and Phase 3 (mobile) are separate engagements.

---

**Detailed plans authored on demand.** When ready to execute M9, say *"plan and execute M9"* — I'll author the detailed M9 plan (~1500 lines) before dispatching subagents.
