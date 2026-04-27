# HRMS Phase 1 — Design Spec (WIP)

**Status:** Draft / In progress. Sections 1–7 presented and approved. Sections 8 (Testing/CI/Observability/Security) and 9 (Implementation order & deliverables) pending.

**Date started:** 2026-04-27
**Owner:** cyberlab@provintell.com (Provintell)

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

### Schema (full sketch in conversation; key tables only here)

**identity / organization / employee:**

`organizations(id, name, slug UNIQUE, country_code, default_currency, default_timezone, default_locale, settings JSONB, plan_id NULL, status)`

`countries(code PK, name, default_currency, default_timezone)`
`country_holidays(country_code, date, name, type, state_code NULL)`
`country_leave_type_defaults(country_code, code, name, default_days, statutory, accrual_type)`

`departments(id, org_id, name, parent_id NULL, head_employee_id NULL)`

`users(id, org_id, email CITEXT, password_hash, status, mfa_enabled, last_login_at, last_login_ip, failed_login_count, preferences JSONB)`
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

### Endpoints (full list in conversation; primary surface)

`/auth/*` — register (admin only), login, login/mfa, refresh, logout, password forgot/reset, mfa enable/confirm/delete, me
`/users/*`, `/roles/*`, `/permissions`, `/departments/*`, `/org/settings`
`/employees/*` (incl. `/me`, `/{id}/reporting-chain`, `/{id}/direct-reports`, `/{id}/probation-status`)
`/leave/types`, `/leave/policies`, `/leave/balances`, `/leave/requests`, `/leave/delegations`
`/schedule/work-schedules`, `/schedule/shifts`, `/schedule/shift-assignments` (incl. `/bulk-pattern`, `/publish`), `/schedule/holidays`, `/schedule/me`
`/attendance/clock-in`, `/clock-out`, `/today`, `/records`, `/team`
`/claims/categories`, `/claims/policies`, `/claims/*` (incl. `/{id}/audit-trail`, `/attachments`)
`/payslips/me`, `/payslips/{id}`, `/payroll/periods`, `/payroll/runs/*` (incl. `/preview`, `/publish`, `/errors`)
`/kpi/templates`, `/kpi/cycles/*`, `/kpi/assignments/*`, `/kpi/reviews/*`, `/kpi/team-summary`
`/certifications/*`, `/training/plans`, `/training/assignments`, `/training/progress`
`/notifications/*`, `/notifications/preferences`
`/reports/*` (registry-driven; `/{code}/run`, `/export`, `/jobs/{id}`, `/saved-views`)
`/dashboards/{me|team|admin}`, `/approvals/inbox`
`/audit/events`, `/audit/payroll-ledger`, `/audit/payroll-ledger/verify`
`/health`, `/health/ready`, `/metrics`

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

**TODO — pending in next session.** Will cover:
- Unit / integration / E2E testing strategy and coverage targets
- Pre-commit hooks, CI pipeline, deployment pipeline
- Logging, metrics, tracing, alerting
- Secrets management, encryption at rest / in transit, OWASP mitigations, GDPR-style data export/delete

## 9. Implementation order & deliverables

**TODO — pending in next session.** Will cover:
- Repo scaffold checklist
- Module build order (auth/identity → employees → leave → attendance → claims → payslip → kpi → cert/training → dashboards/reports)
- Acceptance criteria per module
- Seed data for Provintell

---

## Resume notes

- Conversation paused mid Section 7→8 transition.
- Run `claude --continue` (or `claude -c`) in `/home/universal/Claude/HR_Management/` to resume.
- Sections 1–7 above are approved by the user. Sections 8–9 to be presented next.
- After approval of all sections, this file is finalized (remove "WIP" status), self-reviewed for placeholders/contradictions/ambiguity, then user reviews; then transition to `superpowers:writing-plans` skill for the implementation plan.
