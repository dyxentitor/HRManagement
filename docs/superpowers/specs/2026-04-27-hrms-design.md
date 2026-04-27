# HRMS Phase 1 — Design Spec

**Status:** Approved. All 9 sections presented and locked.
**Date:** 2026-04-27
**Owner:** cyberlab@provintell.com (Provintell)
**Next step:** transition to `superpowers:writing-plans` for the implementation plan.

---

## 0. Phasing strategy (non-negotiable)

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | Web HRMS, single-tenant logical model with multi-tenant-ready schema | **Build now** |
| Phase 2 | Subscription tiers, plan-based gating, billing | Design hooks only |
| Phase 3 | Mobile (reuses Phase 1 APIs) | Design hooks only |

Hard rules:
- No pricing/plan enforcement, billing, or mobile clients in Phase 1.
- All business logic behind versioned REST APIs (`/api/v1/...`).
- Every module designed to be feature-flagged, plan-gated, mobile-consumable without refactor.

---

## 1. Locked decisions (19)

| # | Decision | Lock |
|---|---|---|
| 1 | Phase 1 scope | 8 original modules: Leave, Attendance, Self-Service, Claims, Payslip, KPI, Cert/Training, Team Dashboards. **No** recruitment, onboarding, lifecycle, engagement. |
| 2 | Backend stack | Django 5 + Django REST Framework + Celery + Postgres 16 + Redis |
| 3 | Frontend stack | React 18 + Vite + React Router v6 + TanStack Query + Tailwind + shadcn/ui + React Hook Form + Zod |
| 4 | Repo | Monorepo (`apps/api`, `apps/web`, `packages/contracts`) |
| 5 | Geography | Multi-country-ready schema; English only; **Malaysia** seeded at launch (`MY` / `MYR` / `Asia/Kuala_Lumpur` / `en-MY`). Federal MY holidays only; state holidays Phase 2. |
| 6 | Schedule model | Mixed (fixed + 2-shift); minimal shift management. `schedule_type` enum on employees. No swap workflow / auto-rostering / differentials in Phase 1. |
| 7 | Attendance verification | Trust-based: timestamp + source only. No IP whitelist, geo-fence, or selfie capture. |
| 8 | Employee profile depth | **Tier 2** — HR-essential incl. LHDN/EPF/SOCSO/EIS, encrypted bank, probation/contract end. No document uploads section, no dependents/skills history. |
| 9 | Auth | Email + password (Argon2id) + optional TOTP MFA. Refresh-token rotation. |
| 10 | Approval delegation | Manual delegation if set; otherwise auto-fall-back up the manager chain when approver is on approved leave. |
| 11 | Holidays + shift work | Replacement leave auto-granted on confirmed holiday clock-in. No 2× pay path in Phase 1 (payroll concern). |
| 12 | Notifications | In-app + Email only. WhatsApp/SMS deferred entirely. |
| 13 | AI | All four AI features (KPI summarization, performance insights, smart reminders, training recs) deferred to Phase 2. Build `AIProviderPort` interface unbound. |
| 14 | Theme | User-toggleable (system / light / dark), default **light**, persisted server-side in `users.preferences`. |
| 15 | Reports | 12 standard + 3 HR-ops; generic Report registry pattern. No custom report builder. |
| 16 | Org structure | Single direct manager via `OrgService` abstraction + `departments.head_employee_id` for HR escalations. Matrix reporting Phase 2. |
| 17 | Audit | Tier-1 audit log (consequential actions) + cryptographically chained `payroll_audit_ledger` for salary/bank/IC/tax/payroll changes. 7-year retention; ledger never purged. |
| 18 | Deployment | Portable container stack via Docker Compose. Phase 1 on-prem at Provintell. Phase 2 SaaS deploys same images on K8s/managed services. |
| 19 | Talent plans | Cut from Phase 1. Cert & Training module remains. |

---

## 2. Module map & boundaries

### Backend (Django apps under `apps/api/modules/`)

```
identity/         Auth, MFA, sessions, RBAC, OrgService, audit helpers
organization/     Organizations, departments, country/locale config
employee/         Employee records (Tier 2), reporting lines, probation tracking
leave/            Types, policies, balances, ledger, requests, approvals, delegations
schedule/         Work schedules, shifts, shift_assignments, holidays
attendance/       Clock in/out, records, holiday-work → replacement leave rule
claims/           Categories, policies, requests, attachments, approvals
payslip/          Periods, components, payslips, CSV import, PDF generation
kpi/              Templates, cycles, assignments, reviews, evidence
certification/    Certifications, training plans, assignments, progress
notification/     In-app + email dispatcher, NotificationPort, preferences
reporting/        Report registry, generic runner, exporters (CSV/Excel/PDF)
dashboard/        Read-models for role-based dashboards
common/           BaseModel, audit mixins, encrypted fields, money types, RFC7807
ai/               AIProviderPort interface — no implementation Phase 1
billing/          Stub: feature_flags, plans, subscriptions tables — unused Phase 1
```

### Module dependency rules

- May depend on `common`, `identity`, `organization`, `employee` (foundation).
- Feature modules **must not** import each other directly.
- Cross-module reactions go through internal event bus (Django signals in Phase 1).

### Frontend (`apps/web/src/modules/`) mirrors backend names

```
modules/<name>/
├── routes.tsx
├── pages/
├── components/
├── hooks/
├── api.ts
├── types.ts
└── permissions.ts
```

### Layered separation inside each Django app

```
modules/<name>/
├── models.py             # ORM only
├── repositories.py       # Org-scoped queries
├── services.py           # Business logic
├── workflows.py          # Orchestration (approval chains)
├── serializers.py        # DTOs
├── views.py              # Thin DRF viewsets
├── urls.py
├── permissions.py
├── events.py             # Event types
├── signals.py            # Subscribers
├── tasks.py              # Celery
├── reports.py            # Registered reports
├── admin.py
├── tests/
└── migrations/
```

Hard rule: business logic in `services.py` / `workflows.py`. Views are thin adapters. Models hold no business logic.

---

## 3. Data model

### Conventions

- Every table: `id UUID`, `org_id UUID` (except reference tables `countries`, `country_holidays`), `created_at`, `updated_at`, `deleted_at` (soft delete).
- Money: `DECIMAL(18,4) NOT NULL` + `currency_code CHAR(3) NOT NULL` (default `'MYR'`).
- Datetimes: `TIMESTAMPTZ` UTC; dates `DATE`; times `TIME`.
- Enums: Postgres `CREATE TYPE`.
- Org scope enforced via `TenantScopedManager`.
- Encrypted fields (`bank_account_encrypted`, IC, salary, tax IDs): app-layer envelope encryption; `BYTEA` columns; key in `HRMS_FIELD_ENCRYPTION_KEY` env.
- Partial unique indexes on `(... WHERE deleted_at IS NULL)`.

### Schema sketch

Column lists below are abbreviated to the load-bearing fields. Full nullability, defaults, and indexes are settled during migration authoring; the shape and relationships are the spec.

**identity / organization / employee:**

`organizations(id, name, slug UNIQUE, country_code, default_currency, default_timezone, default_locale, settings JSONB, plan_id NULL, status)`

`countries(code PK, name, default_currency, default_timezone)`
`country_holidays(country_code, date, name, type, state_code NULL)`
`country_leave_type_defaults(country_code, code, name, default_days, statutory, accrual_type)`

`departments(id, org_id, name, parent_id NULL, head_employee_id NULL)`

`users(id, org_id, email CITEXT, password_hash, status, mfa_enabled, last_login_at, last_login_ip, failed_login_count, preferences JSONB, consents JSONB)`
`mfa_devices(id, user_id, type, secret_encrypted, confirmed_at, last_used_at)`
`sessions(id, user_id, refresh_token_hash, ip, ua, expires_at, revoked_at)`

`roles(id, org_id, code, name, description, is_system)`
`permissions(id, code UNIQUE, description)`
`role_permissions(role_id, permission_id)`
`user_roles(user_id, role_id, granted_by, granted_at)`

`employees(id, org_id, user_id NULL, employee_code, first_name, last_name, preferred_name NULL, email, phone, alt_phone NULL, ic_number_encrypted, ic_last4, date_of_birth, gender, nationality, marital_status, religion NULL, address_*, department_id, manager_id, role_title, employment_type, schedule_type, hire_date, probation_end_date NULL, contract_end_date NULL, confirmed_at NULL, bank_name, bank_account_encrypted, bank_account_last4, lhdn_tax_no_encrypted, epf_no_encrypted, socso_no_encrypted, eis_no_encrypted, emergency_contact_*, status, timezone, locale, CHECK (manager_id != id))`

**schedule:**
`work_schedules(id, org_id, employee_id, name, pattern JSONB, effective_from, effective_to NULL)`
`shifts(id, org_id, name, start_time, end_time, crosses_midnight, color)`
`shift_assignments(id, org_id, employee_id, shift_id, work_date, status, assigned_by, published_at NULL, notes, UNIQUE(employee_id, work_date))`
`holidays(id, org_id NULL, date, name, type, applies_to_country_code, applies_to_state_code NULL)`

**leave:**
`leave_types(id, org_id, code, name, accrual_type, default_days, is_paid, requires_attachment, max_consecutive_days NULL, min_advance_notice_days, carry_forward_max, is_statutory, gender_restriction)`
`leave_policies(id, org_id, leave_type_id, applies_to_role_id NULL, applies_to_department_id NULL, days_per_year, tenure_brackets JSONB, effective_from, effective_to NULL)`
`leave_balances(id, org_id, employee_id, leave_type_id, year, entitled, accrued, taken, pending, available GENERATED, carried_forward, UNIQUE(employee_id, leave_type_id, year))`
`leave_balance_ledger(id, org_id, employee_id, leave_type_id, delta, reason, reference_type NULL, reference_id NULL, actor_id NULL, ts)` — append-only
`leave_requests(id, org_id, employee_id, leave_type_id, start_date, end_date, total_days, is_half_day, half_day_period NULL, reason, attachment_url NULL, status, submitted_at, decided_at NULL, decided_by NULL)`
`leave_approvals(id, leave_request_id, level, approver_id, status, comment NULL, acted_at NULL, delegated_to NULL)`
`approval_delegations(id, org_id, delegator_id, delegate_id, scope, effective_from, effective_to, active GENERATED)`

**attendance:**
`attendance_records(id, org_id, employee_id, work_date, clock_in NULL, clock_out NULL, source, is_holiday_work, holiday_id NULL, shift_assignment_id NULL, status, ip NULL, user_agent NULL, computed_hours GENERATED, notes NULL, UNIQUE(employee_id, work_date))`

**claims:**
`claim_categories(id, org_id, code, name, requires_attachment, max_amount_per_claim NULL, currency_code)`
`claim_policies(id, org_id, category_id, role_id NULL, dept_id NULL, annual_limit, monthly_limit, approval_chain JSONB)`
`claim_requests(id, org_id, employee_id, category_id, amount, currency_code, expense_date, description, merchant NULL, status, submitted_at NULL, reimbursed_at NULL, reimbursement_reference NULL)`
`claim_attachments(id, claim_id, filename, content_type, size_bytes, s3_key, uploaded_by, uploaded_at)`
`claim_approvals(id, claim_id, level, approver_id, status, comment, acted_at NULL, delegated_to NULL)`

**payslip:**
`payroll_periods(id, org_id, period_start, period_end, period_type, pay_date, status)`
`payroll_components(id, org_id, code, name, type, is_statutory)`
`payslips(id, org_id, employee_id, period_id, gross, deductions JSONB, net, currency_code, components JSONB, pdf_s3_key NULL, pdf_generated_at NULL, status, published_at NULL, sent_at NULL, source, UNIQUE(employee_id, period_id))`

**kpi:**
`kpi_templates(id, org_id, name, description, applies_to_role_id NULL, applies_to_dept_id NULL)`
`kpi_definitions(id, template_id, code, name, description, metric_type, target NULL, unit, weight, evidence_required, sort_order)`
`kpi_cycles(id, org_id, name, type, starts_on, ends_on, review_opens_on, review_closes_on, status)`
`kpi_assignments(id, cycle_id, employee_id, template_id, kpis JSONB, status)`
`kpi_reviews(id, assignment_id, iteration, stage, scores JSONB, overall_comment, evidence JSONB, submitted_by, submitted_at, ai_summary_id NULL)`
`kpi_review_iterations(id, review_id, change_summary JSONB, ts)`

**certification:**
`certifications(id, org_id, employee_id, name, issuer, certificate_number, issued_on, expires_on NULL, document_s3_key NULL, status, reminder_sent_30d, reminder_sent_60d, reminder_sent_90d)`
`training_plans(id, org_id, name, description, required_for_role_id NULL, required_for_dept_id NULL)`
`training_assignments(id, plan_id, employee_id, assigned_by, due_date, status, completed_at NULL, evidence_s3_key NULL)`
`training_progress(id, assignment_id, progress_pct, notes, ts)`

**notification, audit, billing-stub:**
`notifications(id, org_id, user_id, type, payload JSONB, channel, read_at NULL, sent_at, delivery_status)`
`notification_preferences(user_id, type, channel, enabled)`
`audit_log(id BIGSERIAL, org_id, actor_id NULL, action, entity, entity_id, before JSONB, after JSONB, ip NULL, user_agent NULL, ts)`
`payroll_audit_ledger(seq BIGSERIAL, org_id, actor_id NULL, action, entity, entity_id, payload JSONB, prev_hash CHAR(64), row_hash CHAR(64), ts)` — append-only via DB trigger

`plans(id, name, limits JSONB, features JSONB)` — Phase 2 stub
`subscriptions(id, org_id, plan_id, status, current_period_end)` — Phase 2 stub
`feature_flags(id, org_id NULL, key, enabled, plan_id NULL)` — Phase 2 stub

### Indexing

- Index every `org_id`.
- Index every FK.
- Compound `(org_id, status, ...)` for queues.
- `attendance_records(org_id, employee_id, work_date DESC)`.
- `audit_log(org_id, ts DESC)` and `(entity, entity_id, ts DESC)`.
- BRIN on `audit_log.ts`.

---

## 4. API design

### Conventions

- Base: `/api/v1/`
- Auth: `Authorization: Bearer <access_token>` except `/auth/*` and `/health`.
- JSON; multipart only for file uploads.
- Cursor pagination: `?cursor=&limit=` (default 25, max 100).
- Filtering: `?filter[field]=value&filter[date_range]=start..end`.
- Sorting: `?sort=-created_at,name`.
- Sparse fields: `?fields=id,name,status`.
- Errors: RFC 7807 Problem Details.
- Idempotency: `Idempotency-Key` required on POST for `/leave/requests`, `/claims`, `/attendance/clock-*`, `/payroll/runs`.
- Rate limiting: 100 req/min per user, 300 req/min per IP.
- Datetimes: ISO-8601 UTC.
- Money: `{ amount: "1234.5600", currency: "MYR" }` (string).
- OpenAPI: drf-spectacular at `/api/v1/schema/`, Swagger UI at `/api/v1/docs/`.
- Permissions documented per route via `x-permissions` extension.

### Endpoints (load-bearing surface)

This is the primary surface; every viewset emits its standard CRUD endpoints in addition to those called out below. The authoritative list is the OpenAPI spec at `/api/v1/schema/`.

```
auth:           register (admin-only), login, login/mfa, refresh, logout,
                password forgot/reset, mfa enable/confirm/delete, me
identity:       /users/*, /roles/*, /permissions, /departments/*, /org/settings
employees:      /employees/*, /me (alias), /{id}/reporting-chain,
                /{id}/direct-reports, /{id}/probation-status
self-service:   GET/PATCH /me, GET /me/export (PII export), DELETE /me (soft-delete + anonymize)
leave:          /leave/{types,policies,balances,requests,delegations}
schedule:       /schedule/{work-schedules,shifts,shift-assignments,holidays,me}
                shift-assignments includes /bulk-pattern, /publish
attendance:     /attendance/{clock-in,clock-out,today,records,team}
claims:         /claims/{categories,policies}, /claims/* (incl. /{id}/audit-trail, /attachments)
payslips:       /payslips/me, /payslips/{id}
payroll:        /payroll/{periods,runs/*} (incl. /preview, /publish, /errors)
kpi:            /kpi/{templates,cycles/*,assignments/*,reviews/*,team-summary}
certification:  /certifications/*, /training/{plans,assignments,progress}
notifications:  /notifications/*, /notifications/preferences
reports:        /reports/{code}/run, /reports/{code}/export, /reports/jobs/{id},
                /reports/saved-views
dashboards:     /dashboards/{me,team,admin}, /approvals/inbox
audit:          /audit/events, /audit/payroll-ledger, /audit/payroll-ledger/verify
ops:            /health, /health/ready, /metrics, POST /_telemetry/web-vitals
```

---

## 5. Roles & permissions

### System roles

`super_admin` (Phase 2), `org_admin`, `hr_manager`, `finance`, `manager`, `team_lead` (clonable), `employee`, `auditor`. Users may hold multiple roles (union of permissions).

### Permission code format

`<module>:<resource>:<action>[:<scope>]` with scope `self|team|org`.

### Default mapping (summary)

| Family | employee | team_lead | manager | finance | hr_manager | org_admin | auditor |
|---|---|---|---|---|---|---|---|
| `*:read:self` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `*:read:team` | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `*:read:org` | — | — | — | claims/payroll | ✓ | ✓ | ✓ |
| `leave:request:approve:team` | — | ✓ | ✓ | — | ✓ | ✓ | — |
| `claim:approve:team` | — | — | ✓ | ✓ | ✓ | ✓ | — |
| `claim:approve:finance` | — | — | — | ✓ | ✓ | ✓ | — |
| `claim:reimburse:finance` | — | — | — | ✓ | — | ✓ | — |
| `payroll:run:*` | — | — | — | ✓ | ✓ | ✓ | — |
| `employee:write:org` | — | — | — | — | ✓ | ✓ | — |
| `employee:bank:read` | self | — | — | ✓ | ✓ | ✓ | — |
| `kpi:review:write:team` | — | ✓ | ✓ | — | ✓ | ✓ | — |
| `attendance:override:org` | — | — | — | — | ✓ | ✓ | — |
| `audit:read:org` | — | — | — | — | ✓ | ✓ | ✓ |
| `audit:payroll-ledger:*` | — | — | — | — | — | ✓ | read |
| `*:write` (settings/types/policies) | — | — | — | — | ✓ | ✓ | — |
| `role:write` | — | — | — | — | — | ✓ | — |

### Authorization mechanics

DRF `HRMSPermission` composes: (1) user has required perms, (2) tenant scope (`obj.org_id == user.org_id`), (3) data scope (self/team/org).

`TenantScopedManager` defaults querysets by `org_id` (defense in depth).

Permission set cached per user in Redis 5 minutes; invalidated on `role_permissions` or `user_roles` change.

### Self-service field whitelist (`employee:write:self`)

`phone, alt_phone, address_*, emergency_contact_*, preferred_name, bank_name (re-MFA), bank_account_encrypted (re-MFA)`. Bank changes by self trigger HR notification email.

### Phase 2 hooks (build now, unused)

`@requires_feature("kpi")` decorator returns True for all keys in Phase 1.
`PlanLimitGuard` middleware is pass-through.

---

## 5b. Report registry (12 standard + 3 HR-ops)

Every entry below is a `Report` registered into the `reporting/` registry. Each gets a generic frontend page (filters from the report's schema, table view, CSV/Excel/PDF export, "save view"). Adding a new report = ~30 lines of Python; the frontend renders it without changes.

| # | Code | Title | Default scope | Filters | Output |
|---|---|---|---|---|---|
| 1 | `leave.balance_summary` | Leave balance summary | self / team / org | dept, leave_type, as_of_date | CSV/PDF |
| 2 | `leave.taken_period` | Leave taken (period) | self / team / org | dept, leave_type, date_range | CSV/PDF |
| 3 | `leave.pending_approvals` | Pending leave approvals | manager queue | approver, age_days | CSV |
| 4 | `attendance.daily_summary` | Daily attendance summary | team / org | dept, date | CSV/PDF |
| 5 | `attendance.late_absent_log` | Late/absent log | team / org | dept, date_range, status | CSV |
| 6 | `attendance.hours_worked` | Hours worked (period) | self / team / org | dept, date_range | CSV/PDF |
| 7 | `claims.pending_by_approver` | Pending claims by approver | manager / finance | approver, age_days | CSV |
| 8 | `claims.spend_by_category` | Claims spend by category | team / org | dept, category, date_range | CSV/PDF + bar chart |
| 9 | `claims.reimbursement_status` | Reimbursement status | org / finance | status, date_range | CSV |
| 10 | `kpi.cycle_progress` | KPI cycle progress | team / org | cycle, dept | CSV + progress bar |
| 11 | `cert.expiring_soon` | Certifications expiring | team / org | within_days (30/60/90), cert_type | CSV/PDF |
| 12 | `headcount.snapshot` | Headcount snapshot | org | as_of_date, dept, employment_type | CSV/PDF |
| HR-ops | `hrops.probation_ending` | Probation ending soon | org | within_days | CSV |
| HR-ops | `hrops.contract_ending` | Contract ending soon | org | within_days | CSV |
| HR-ops | `hrops.birthdays_this_month` | Birthdays this month | org | month | CSV |

No custom report builder in Phase 1.

---

## 6. Workflow engines & event flows

### Shared approval workflow engine (`common/workflow.py`)

`ApprovalStep(level, resolver, required, deadline_hours)` + `ApprovalChain(code, steps)` + `WorkflowEngine.{submit, act, cancel, withdraw}`.

Resolvers: `DirectManagerResolver`, `DepartmentHeadResolver`, `RoleResolver(code)`, `FinanceResolver`.

### Effective approver routing

```
1. Manual delegation (approval_delegations active for delegator + scope) → delegate
2. Else if approver on approved leave today → fall back to OrgService.get_direct_manager(approver)
3. Else → original resolver result
```

Every routing decision logged in approvals table with `delegated_to` populated when applicable.

### Pre-configured chains (Phase 1 seed)

- `LEAVE_DEFAULT`: DirectManager
- `CLAIM_UNDER_500`: DirectManager → Finance
- `CLAIM_500_TO_5000`: DirectManager → DepartmentHead → Finance
- `CLAIM_OVER_5000`: DirectManager → DepartmentHead → HRManager → Finance

Selection via `claim_policies.approval_chain_code`.

### Event bus (Django signals, in-process Phase 1)

**Catalogue:** identity (UserLoggedIn, MFAEnabled), employee (Created, Updated, ProbationEndingSoon, ContractEndingSoon), leave (Requested, Approved, Rejected, Cancelled, BalanceAdjusted), schedule (RosterPublished, ShiftAssigned, ShiftChanged), attendance (Clocked, HolidayWorkConfirmed), claims (Submitted, Approved, Rejected, Reimbursed), payroll (RunImported, RunPublished), payslip (Published), kpi (CycleOpened, SelfReviewSubmitted, ManagerReviewSubmitted, CycleClosed), certification (Added, ExpiringSoon).

**Key cross-module reactions:**

- `leave.LeaveApproved` → notify, mark attendance days `on_leave`, audit
- `claims.ClaimSubmitted` / `Approved` → notify next approver / requester
- `attendance.HolidayWorkConfirmed` → grant +1 REPLACEMENT leave (idempotent on `(reference_type, reference_id, reason)`); audit
- `employee.EmployeeUpdated` → audit always; payroll_audit_ledger if salary/bank/IC/tax changed; HR notification on self-edit of bank
- `employee.ProbationEndingSoon` (15/7/0d) → notify HR + manager + employee
- `certification.CertificationExpiringSoon` (90/60/30d) → notify employee + manager (idempotent via `reminder_sent_*`)
- `kpi.SelfReviewSubmitted` → notify manager
- `kpi.ManagerReviewSubmitted` → notify employee; recompute cycle progress

### Scheduled jobs (Celery beat)

`*/5 * * * *` sweep_session_revocations
`0 1 * * *` close_unclosed_attendance_records
`0 2 * * *` accrue_monthly_leave
`0 3 1 * *` accrue_annual_leave
`0 4 * * *` detect_probation_endings
`0 4 * * *` detect_contract_endings
`0 5 * * *` detect_certification_expiry
`0 6 * * *` sync_holidays_from_country_seed (next year)
`30 23 * * *` purge_audit_log_archive (>7y to S3)
`0 * * * *` send_pending_email_notifications (batched)
`0 0 1 1 *` carry_forward_annual_leave
`0 1 * * *` detect_kpi_overdue_reviews

All idempotent; track last-run in `job_runs`.

---

## 7. Frontend architecture & UX patterns

### App shell

`<RootLayout>` (top bar + sidebar + theme + query providers) wraps `<SignedOutGate>` + `<PermissionContext>` + `<Outlet/>`. Routes composed from each module's `routes.tsx` at `app.tsx`. `<DashboardRouter>` picks dashboard by highest role.

### Auth & permissions

`useAuth()` exposes `{ user, perms: Set<string>, login, logout, refresh }`. Refresh-token silent renewal ~5 min before expiry. `useCan(perm)` for menu/route gating. `<RouteGuard perms=[...]>` wraps protected screens. Server-side enforcement is authoritative.

### Data layer

TanStack Query. Module-namespaced query keys (`['leave','requests','self', filters]`). Mutations invalidate by namespace prefix. Stale times: 60s lists / 300s static data / 0s dashboards. Typed client via `openapi-fetch` consuming `packages/contracts/generated.ts`.

### Forms

React Hook Form + Zod. Shared `<FormShell>` (loading, errors, dirty-warn, autosave drafts). `<FileUpload>` streams to presigned S3 URL — content never traverses API. RFC 7807 `errors[]` mapped to fields by `field` code.

### Approval Inbox (`/approvals`)

Tabs: All / Leave / Claims. Server merges via `GET /approvals/inbox` (incl. delegated rows). Side-drawer with comment box + Approve/Reject. Keyboard: ↑↓, A, R, Esc. Bulk approve with single comment. Reject requires comment.

### Theme

`ThemeProvider` reads `users.preferences.theme` → `class="dark"` on `<html>`. System-mode subscribes to `prefers-color-scheme`. Inline pre-React script reads localStorage cache to avoid flash. Three-state toggle in top bar.

### Notifications

Top-bar `<NotificationBell>` polls `/notifications?unread_only=true` every 60s (SSE upgrade Phase 2). Badge + side panel grouped today/yesterday/older. Click → deep link + mark read. Preferences page: (type × channel) matrix; security-relevant types non-disablable.

### Dashboard cards

Reusable cards composed per role. Each card fetches via TanStack Query independently. Loading skeletons + empty states per card.

### Tables

`<DataTable>` (TanStack Table v8): sticky header, virtualized rows, column resize/reorder/visibility, per-column filters declared in column meta, saved views, cursor pagination, CSV/Excel export, instructive empty states.

### Errors & loading

Error boundary per route segment. TanStack errors surface in boundary (loaders) or in-place (queries). Skeletons first load; cached + background refetch thereafter. `<MutationToast>` standardized.

### Performance budgets (CI-enforced)

- Initial JS gz < 250 KB
- LCP (4G sim) < 2.5 s
- Code-split per module via `React.lazy`
- shadcn/ui imported individually (no barrels)

### Accessibility

WCAG 2.1 AA. `@axe-core/react` in dev, `pa11y-ci` smoke in CI. Keyboard reachable, visible focus rings, ARIA on forms/tables, no info via color alone.

### i18n

`react-i18next` configured for `en-MY`. All copy via `t('namespace.key')`. Dates/numbers/currency via `Intl.*`. TZ math via `date-fns-tz`.

### Mobile-readiness (Phase 3 hooks)

Responsive at 375 px. API client portable to RN (no DOM deps). Auth/perms/query/form layers reusable in RN with storage adapter swap.

---

## 8. Testing, CI/CD, observability, security

### Testing strategy

**Backend (Django) — pytest + pytest-django:**

| Layer | What's tested | Tool | Target coverage |
|---|---|---|---|
| Domain / services | Business logic in `services.py`, `workflows.py` (pure functions, fakes for repos) | pytest unit | ≥ 85% |
| Repositories | Query helpers respect `org_id` scope; soft-delete filters | pytest + Postgres testcontainer | ≥ 70% |
| API / views | Endpoints — happy + permission denial + validation errors + RFC7807 shape | pytest + DRF `APIClient` | ≥ 75% |
| Workflows end-to-end | Submit→Approve→Notify chains with real DB, real signals, fake email/S3 | pytest integration | every chain tested |
| Migrations | Forward + backward migration smoke on each PR | `makemigrations --check` + `migrate --plan` | always pass |
| Hash-chain integrity | `payroll_audit_ledger` rows verify on every test run | dedicated suite | always pass |

Discipline:
- TDD for `services.py`/`workflows.py` (rigid, per skill guidance).
- Test factories via `factory_boy`, one factory per model, composable.
- Time-freezing via `freezegun` for accrual/expiry/probation jobs.
- Real Postgres in tests (testcontainer in CI, Docker locally) — never SQLite.
- No mocked DB in integration tests.

**Frontend (React) — Vitest + Testing Library + Playwright:**

| Layer | Tool |
|---|---|
| Component unit | Vitest + RTL + `@axe-core/react` |
| Hooks | Vitest + MSW |
| Forms | Vitest + RTL + MSW |
| E2E happy paths (leave, claims, KPI) | Playwright against seeded Docker Compose stack |
| Visual regression | Playwright `toHaveScreenshot` (light + dark) |
| Accessibility smoke | `pa11y-ci` on key pages (CI stage) |

E2E required modules: leave, claims, KPI. Attendance and payslip viewing are covered by API integration tests.

### Pre-commit hooks

`ruff check --fix`, `ruff format`, `mypy apps/api`, `biome check apps/web --write`, `tsc --noEmit` on staged files, `detect-secrets`, `check-merge-conflict`, `check-json`, `check-yaml`, `end-of-file-fixer`, `trailing-whitespace`. Husky on the frontend mirrors biome+tsc on staged files.

### CI pipeline (GitHub Actions)

Jobs (run on push and PR):

- `api`: postgres+redis+minio services; `uv sync`; ruff check/format-check; mypy; pytest with coverage gate; `makemigrations --check`; `migrate` smoke; `spectacular --validate`; coverage uploaded.
- `web`: pnpm install (frozen); biome check; `tsc --noEmit`; vitest with coverage; `vite build` with bundle-size gate (gz < 250 KB); pa11y-ci against build preview.
- `contracts`: regenerate OpenAPI via drf-spectacular; regenerate TS types via openapi-typescript; diff against committed `packages/contracts/*` — fail on drift.
- `e2e`: depends on api+web; brings up docker compose; seeds test data; runs playwright with html reporter; uploads trace artifacts on failure.
- `security`: trivy fs (Dockerfile + python deps); bandit on apps/api; `npm audit --omit=dev`; osv-scanner.

Rules:
- `main` is protected; PRs require passing CI + 1 review.
- Coverage delta drops fail PRs.
- Migration drift fails PR.
- OpenAPI drift fails PR.
- Bundle-size regression > 5% fails PR.

### CD pipeline (Phase 1)

On push to `main` after CI passes:

- Build api + web docker images, tag with commit sha, push to registry.
- `deploy-staging`: ssh to staging host, `docker compose pull && up -d`, run migrations, smoke `/health/ready`.
- `deploy-production`: manual approval gate; same steps against prod; blue-green via two compose stacks behind nginx; rollback = nginx upstream switch back.

Phase 2 SaaS switches to Helm/ArgoCD against the same Docker images.

### Database operations

- Migrations: every PR touching `models.py` includes the generated migration. Manual SQL only under `migrations/sql/`.
- Reversibility: every migration must be reversible (`RunPython` with `forwards` and `reverse`); reversibility verified in CI by attempting a roll-back on a copy of staging schema.
- Pre-deploy phase: deploy = (1) run migrations, (2) deploy code. For destructive migrations, use the **expand-contract** pattern across two releases.
- Backups: nightly `pg_dump` to MinIO/S3, gzipped, encrypted at rest. Weekly restore-verification job spins up a temporary container, restores, runs a smoke query (counts rows, verifies hash chain head). Failure pages oncall.

### Observability

| Concern | Tool | Notes |
|---|---|---|
| Structured logs | `structlog` JSON output → Loki | request_id propagated; PII never logged |
| Metrics | `prometheus_client` exporter at `/metrics` | scraped by Prometheus; Grafana dashboards |
| Traces | OpenTelemetry SDK; OTLP → Tempo (or Jaeger) | through Django → Celery |
| Errors | Sentry | source maps for frontend; PII-sanitized stack traces |
| Uptime | Uptime-Kuma hitting `/health/ready` every 30s | alerts via email + Telegram |
| Frontend monitoring | Web-vitals → `POST /api/v1/_telemetry/web-vitals` | LCP, FID, CLS sampled |

Required Grafana dashboards (prebuilt):

1. *API health* — request rate, P50/P95/P99 latency, error rate, by endpoint.
2. *Database* — connection pool usage, slow query count, replication lag (if any).
3. *Celery* — queue depth per queue, job duration, failure rate, retries.
4. *Auth* — login attempts, MFA usage, failed login rate (anomaly threshold = alert).
5. *Business* — leave/claim/KPI submissions per day, approval SLA (avg hours-to-decision).

Phase 1 alert rules:

- API 5xx rate > 1% over 5 min → page.
- API P95 latency > 1s over 10 min → warn.
- DB connection pool > 80% → warn.
- Celery queue depth > 1000 → warn; > 10,000 → page.
- Failed-login rate > 50/min from a single IP → page (brute force).
- `payroll_audit_ledger` verification job failure → page.
- Backup job failure → page.
- Disk usage > 80% on any node → warn; > 95% → page.

### Security (OWASP Top 10 + HR-specific)

Application layer:

- **A01 Broken Access Control** — `HRMSPermission` + `TenantScopedManager` defense in depth. Explicit perms per endpoint; object-level checks via `has_object_permission`.
- **A02 Cryptographic failures** — Argon2id for passwords. Field-level envelope encryption for bank/IC/tax/salary. TLS 1.2+ enforced; HSTS header.
- **A03 Injection** — DRF + ORM kill SQL injection by default. Raw SQL forbidden outside `migrations/sql/`. React XSS-safe; `dangerouslySetInnerHTML` banned via lint rule.
- **A04 Insecure design** — RBAC + audit log + chained payroll ledger by design. Re-MFA required for sensitive operations (bank update, role change, MFA disable).
- **A05 Security misconfig** — secrets via env only; `.env.example` committed, `.env` gitignored. `DEBUG=False` enforced in prod via startup check. CORS allowlist explicit.
- **A06 Vulnerable components** — Dependabot/Renovate weekly; CI fails on osv-scanner / npm audit high-severity.
- **A07 ID & auth failures** — TOTP MFA available; refresh-token rotation; session revocation on password change; lockout after 5 failed logins (15 min, IP-based).
- **A08 Data integrity failures** — payroll ledger hash chain; Idempotency keys prevent double-action.
- **A09 Logging & monitoring failures** — structured logs to Loki; Sentry; alerts. Audit log retains 7 years.
- **A10 SSRF** — file uploads via signed S3 PUT URLs only; backend never fetches arbitrary URLs.

HR-specific risks:

- Salary peeking — `employee:bank:read` and salary fields gated behind separate perm; salary changes write to chained ledger.
- Self-edit of bank — fresh MFA challenge required AND HR notified by email (non-disablable).
- Mass-leave abuse — anomaly detector flags > N approvals by same user in < M minutes (Phase 2).
- PII export — `GET /me/export` returns user's data as JSON; `DELETE /me` is soft-delete + anonymization (Phase 2 fully; Phase 1 endpoint exists with irreversibility warning).
- Receipt/cert document leakage — S3 presigned GET URLs are time-limited (5 min); HMAC includes user ID so URL-sharing is detectable.

Required headers (Nginx/Caddy + Django middleware):

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
                         img-src 'self' data: https://<cdn>; connect-src 'self' https://api.<host>;
                         frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Secrets management:

- Phase 1: `.env` files on host, mode 0600, owned by service user.
- Required: `DJANGO_SECRET_KEY`, `HRMS_FIELD_ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`, `S3_*`, `SMTP_*`, `JWT_SIGNING_KEY`.
- Encryption keys rotated yearly via documented procedure (re-encrypt-on-write pattern).
- Phase 2: AWS Secrets Manager / HashiCorp Vault — same env-var-at-runtime contract.

Privacy / compliance:

- Data residency: Phase 1 deployment in MY (Provintell on-prem). Phase 2 SaaS docs state per-region deployment available.
- Right to erasure: `/me/export` (JSON) and `/me/delete` (soft-delete + anonymize) endpoints; audit log retains pseudonymized actor ID.
- Retention: 7-year audit log retention. Employee records retained per MY Employment Act (≥ 6 years post-termination); soft-delete preserves data; hard-delete is HR-initiated only.
- Consent log: `users.consents JSONB` records terms/privacy acceptance with version + timestamp + IP.

---

## 9. Implementation order & deliverables

### Sequencing principles

1. Foundations before features. Identity/RBAC/employee end-to-end before any HR module.
2. One module at a time, end-to-end (DB → service → API → frontend → tests → docs → demo data) before the next. No half-built modules.
3. Reuse the workflow engine — built once during the leave module; claims module reuses it.
4. Reports come last (depend on real data shapes from feature modules).
5. `AIProviderPort` defined but unbound — no Anthropic SDK in Phase 1.

### Build order (12 milestones)

| # | Milestone | Output | Hard prerequisites |
|---|---|---|---|
| 0 | Repo scaffold | Monorepo with `apps/api`, `apps/web`, `packages/contracts`; Docker Compose; CI green on hello-world; pre-commit; `make dev`/`make test`/`make migrate`/`make contracts` working | — |
| 1 | Identity + Org + RBAC + Audit | Login/MFA, users, roles, perms, departments, org settings; Tier-1 audit log; `OrgService`; `TenantScopedManager`; chained ledger table created (unused yet) | M0 |
| 2 | Employee directory (Tier 2) | Full employee record incl. encrypted bank/IC/tax IDs; reporting lines; probation/contract end tracking; `/employees/me`; HR admin CRUD | M1 |
| 3 | Common workflow engine + Leave | `ApprovalChain`/`Step`/`Engine`; leave types/policies/balances/ledger/requests/approvals/delegations; full leave UX | M2 |
| 4 | Schedule + Attendance | Work schedules, shifts (2-shift), shift_assignments + roster grid + bulk publish; attendance clock-in/out; holiday → replacement leave rule | M3 |
| 5 | Claims | Categories, policies, requests, attachments (presigned S3), approval chain (reuses engine), audit trail | M3 |
| 6 | Payslip + Payroll CSV import | Periods, components, payslip generation, PDF rendering, CSV import with preview/lint, publish triggers ledger | M2, M1 |
| 7 | KPI | Templates, cycles, assignments (frozen snapshot), self/manager review iterations, evidence upload, team summary | M2 |
| 8 | Certification + Training | Certifications with expiry detection cron + reminders; training plans/assignments/progress | M2 |
| 9 | Notifications (UX finalization) | In-app bell + slide-over, email dispatch via SMTP adapter, preferences matrix, batched send | scaffold from M1; UX lands here |
| 10 | Dashboards + Approvals Inbox | Role-aware dashboards, unified approvals queue, dashboard cards | all feature modules |
| 11 | Reports (12 + 3 ops) | Generic Report registry + runner + exporters (CSV/Excel/PDF); 15 reports registered; saved views | all feature modules |
| 12 | Hardening + launch prep | Backup verification, monitoring dashboards, alert rules, runbook, seed data for Provintell, demo accounts | all above |

The notification scaffold (table, port, event subscriptions) appears at M1; modules emit events as they're built; M9 finalizes the in-app + email UX.

### Acceptance criteria per milestone

For every milestone, all must hold:

1. Schema migration committed, reversible, runs cleanly on a fresh DB.
2. Service/workflow unit tests cover happy + edge cases, ≥ 85% line coverage.
3. API endpoints documented in OpenAPI; `make contracts` regenerates frontend types cleanly; no diff on re-run.
4. DRF integration tests cover 200, 401, 403, 422 paths for every endpoint.
5. Frontend pages render in light + dark; pass axe + pa11y.
6. At least one E2E happy-path Playwright test where applicable (leave, claims, KPI).
7. Permission codes registered in catalogue; default role mappings updated.
8. Events emitted are documented in the event catalogue; subscribers tested.
9. Audit/ledger writes verified with hash-chain integrity test where applicable.
10. Seed data fixture loads cleanly into a fresh DB.
11. CHANGELOG entry added.
12. Demo / smoke walkthrough recorded (5-min screencast or step list).

### Repo scaffold checklist (M0 deliverable)

```
hrms/
├── apps/
│   ├── api/
│   │   ├── pyproject.toml          # uv-managed
│   │   ├── manage.py
│   │   ├── hrms_api/
│   │   │   ├── settings/{base,dev,test,prod}.py
│   │   │   ├── urls.py
│   │   │   ├── celery.py
│   │   │   └── wsgi.py / asgi.py
│   │   ├── modules/                # one Django app per HRMS module, added per milestone
│   │   ├── common/                 # BaseModel, encrypted fields, money types, RFC7807, mixins
│   │   ├── conftest.py             # pytest fixtures (factories, client, etc.)
│   │   └── Dockerfile
│   └── web/
│       ├── package.json            # pnpm
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── biome.json
│       ├── playwright.config.ts
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app.tsx
│       │   ├── modules/            # one per milestone
│       │   ├── components/         # shadcn primitives, FormShell, DataTable, FileUpload
│       │   ├── lib/                # api-client, auth, perm, query, theme, i18n
│       │   ├── routes/
│       │   └── styles/
│       └── Dockerfile
├── packages/
│   └── contracts/
│       ├── package.json
│       ├── openapi.yaml            # generated, committed
│       ├── generated.ts            # generated, committed
│       └── README.md               # how to regenerate
├── docs/
│   ├── superpowers/specs/
│   ├── runbooks/
│   └── adr/                        # architectural decision records
├── deploy/
│   ├── docker-compose.yml          # dev: postgres, redis, minio, mailhog, api, worker, beat, web, nginx
│   ├── docker-compose.prod.yml     # prod overrides
│   ├── nginx/default.conf
│   └── caddy/                      # alternate TLS terminator
├── .github/workflows/{ci,deploy-staging,deploy-prod}.yml
├── .pre-commit-config.yaml
├── .gitignore
├── .env.example
├── Makefile                        # dev, test, migrate, contracts, seed, build, deploy
└── README.md
```

### Demo seed data for Provintell (M12)

`make seed-provintell` loads:

- 1 organization "Provintell" (`country=MY`, `currency=MYR`, `timezone=Asia/Kuala_Lumpur`).
- 3 departments: Operations (SOC), Engineering, Admin/HR — Operations has `head_employee_id` set.
- 8 employees: 1 `org_admin`, 1 `hr_manager`, 1 `finance`, 2 `manager` (Ops + Eng), 3 `employee` (2 Ops shift workers, 1 Eng fixed-hour). Realistic MY names; sample IC/bank/tax IDs. 2 employees have `schedule_type='shift'`.
- 2 shifts: Day 09:00–18:00, Night 22:00–07:00.
- 30 days of past attendance — mix of fixed and shift, including 1 holiday-work confirmation that triggered a replacement leave grant.
- Leave types & policies seeded from `country_leave_type_defaults` for MY: Annual (tenure-bracketed), Medical, Maternity, Paternity, Compassionate, Unpaid, Replacement.
- 2026 federal MY public holidays in `holidays`.
- Claim categories (Travel, Meals, Office Supplies, Training, Other) with policies linked to chains (`CLAIM_UNDER_500`, `CLAIM_500_TO_5000`).
- 1 KPI cycle (current quarter), 2 templates (Engineer, Operations), assignments for all employees.
- Sample certifications: SANS GCIH (one expiring in 90d → triggers reminder), CompTIA Security+, AWS Solutions Architect.
- Sample claims: 3 in various states (draft, submitted, approved-pending-finance, reimbursed).
- Sample leave requests: 1 approved future-dated, 1 currently active, 1 pending.

### Demo accounts (Phase 1 only; scrubbed when seeder runs with `--prod`)

| Email | Password | Role(s) |
|---|---|---|
| `admin@provintell.demo` | `Demo!2026` | `org_admin` |
| `hr@provintell.demo` | `Demo!2026` | `hr_manager` |
| `finance@provintell.demo` | `Demo!2026` | `finance` |
| `ops.lead@provintell.demo` | `Demo!2026` | `manager` (Operations) |
| `eng.lead@provintell.demo` | `Demo!2026` | `manager` (Engineering) |
| `analyst1@provintell.demo` | `Demo!2026` | `employee` (Ops, shift) |
| `analyst2@provintell.demo` | `Demo!2026` | `employee` (Ops, shift) |
| `dev1@provintell.demo` | `Demo!2026` | `employee` (Eng, fixed) |

### Documentation deliverables

| Doc | Location |
|---|---|
| Design spec (this) | `docs/superpowers/specs/` |
| ADRs (one per major lock) | `docs/adr/` |
| Runbook (deploy, rollback, restore-from-backup, key rotation, payroll-ledger verification) | `docs/runbooks/` |
| API docs (auto-generated) | `/api/v1/docs/` |
| User guide (HR admin, manager, employee) | `docs/user-guide/` |
| New-dev onboarding | `README.md` + `docs/dev/getting-started.md` |

### Definition of "Phase 1 done"

All of:

1. All 12 milestones meet their acceptance criteria.
2. Provintell's actual employees migrated (real data, not demo): 1 org_admin, 1 hr, all current employees in `employees`, current departments in `departments`, current leave balances reconciled with prior records.
3. At least one full leave cycle (apply → approve → balance update → notification) executed against production data.
4. At least one full claim cycle (submit → manager → finance → reimburse) executed.
5. At least one KPI cycle initiated.
6. Backup + restore procedure tested end-to-end against production data.
7. Monitoring dashboards green for ≥ 7 days; alerts wired and tested with synthetic incidents.
8. Provintell HR signed off after a 2-week parallel run alongside their existing process.

### What Phase 1 explicitly does NOT include

- Recruitment / Jobs / Candidates module.
- Onboarding / offboarding workflows.
- Document storage at the employee level (only certifications + claims have docs).
- Engagement features (announcements, socials, events, pulse surveys).
- AI features (port exists, unbound).
- Shift swap workflow / auto-rostering / coverage rules / shift differentials.
- IP whitelist / geofence / selfie capture for attendance.
- WhatsApp / SMS notifications.
- Mobile app.
- Subscription / billing / plan-gating enforcement.
- Multi-currency / multi-language / multi-timezone in active use (machinery present, English-MY only seeded).
- Bank file / EPF / SOCSO / EIS / LHDN export generation.
- Custom report builder.
- Matrix reporting (`reporting_lines` table).
- State-level public holidays (federal MY only).
- Talent / career development plans.
