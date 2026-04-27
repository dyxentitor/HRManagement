# HRMS M5–M8 Milestone Roadmap

**Purpose:** Lock the scope, data model, and sub-plan breakdown for the next four milestones (Claims, Payslip+Payroll, KPI, Certification+Training) in one document, so the path from M5 → M9 boundary is visible. Detailed step-by-step plans (M5a/b/c, etc.) are authored per milestone immediately before execution.

**State at start of M5:** 5 milestones shipped (`v0.1.0-m{0,1,2,3,4}`). 268 backend tests + 5 frontend tests. Permission catalogue: 58 codes. Workflow engine, audit log, payroll-ledger table, and `BalanceService` are all live and reusable.

---

## M5 — Claims

**Spec reference:** spec §3 (`claim_categories`, `claim_policies`, `claim_requests`, `claim_attachments`, `claim_approvals`), §4 (`/claims/*` endpoints), §6 (claim chains).

**Goal:** Expense claims with file attachments and a 2- or 3-step approval workflow (Direct manager → optional Department head → Finance). Reuses M3a workflow engine end-to-end. Finance has a dedicated reimbursement queue.

### Data model

```
claim_categories(id, org_id, code, name, requires_attachment, max_amount_per_claim, currency_code)
claim_policies(id, org_id, category_id, role_id NULL, dept_id NULL,
               annual_limit, monthly_limit, approval_chain_code)
claim_requests(id, org_id, employee_id, category_id,
               amount, currency_code, expense_date, description, merchant,
               status, current_level,
               submitted_at, reimbursed_at, reimbursement_reference)
claim_attachments(id, claim_id, filename, content_type, size_bytes, s3_key, uploaded_by, uploaded_at)
claim_approvals(id, claim_id, level, approver_id, status, comment, acted_at, delegated_to)
```

`claim_requests.status`: `draft|submitted|manager_approved|finance_approved|reimbursed|rejected|cancelled`.

### Pre-configured chains (registered in `claims/chains.py`)

```
CLAIM_UNDER_500:      DirectManager → Finance                                         (≤ MYR 500)
CLAIM_500_TO_5000:    DirectManager → DepartmentHead → Finance                        (MYR 500.01..5000)
CLAIM_OVER_5000:      DirectManager → DepartmentHead → HRManagerRole → Finance        (> MYR 5000)
```

Chain selected at submit time from category's `approval_chain_code` OR by amount-band rule for default categories.

### API endpoints

```
GET    /api/v1/claims/categories                read claim categories
POST   /api/v1/claims/categories                hr_manager+ creates
GET    /api/v1/claims/policies
POST   /api/v1/claims/policies

GET    /api/v1/claims                            ?scope=self|team|finance-queue
POST   /api/v1/claims                            multipart with attachments
GET    /api/v1/claims/{id}
PATCH  /api/v1/claims/{id}                       only when status='draft'
POST   /api/v1/claims/{id}/submit
POST   /api/v1/claims/{id}/approve               manager OR finance level (engine routes)
POST   /api/v1/claims/{id}/reject                comment required
POST   /api/v1/claims/{id}/mark-reimbursed       finance only; sets reimbursement_reference
GET    /api/v1/claims/{id}/audit-trail           returns approvals[] + audit_log entries
POST   /api/v1/claims/{id}/attachments           multipart; presigned S3 PUT URL flow
DELETE /api/v1/claims/{id}/attachments/{aid}
```

### File structure

```
apps/api/modules/claims/                  NEW
├── __init__.py, apps.py, models.py, admin.py
├── chains.py                               CLAIM_UNDER_500, CLAIM_500_TO_5000, CLAIM_OVER_5000 + selector
├── services/{claim_request.py, attachment.py}
├── signals.py                              claims-side listeners on workflow signals
├── serializers.py, views.py, urls.py
├── migrations/
└── tests/

apps/web/src/modules/claims/               NEW
├── api.ts, routes.tsx
└── pages/{ClaimSubmitPage, MyClaimsPage, FinanceQueuePage}.tsx

apps/api/modules/identity/fixtures/permissions_m5.yaml  (claim:* codes)
```

### Sub-plans

- **M5a — Backend (data + workflow + endpoints)** — single sub-plan, ~3 tasks:
  1. Models + chains + permission seed
  2. Service layer (submit/approve/reject/cancel/mark-reimbursed) + signal-driven `claim_approvals`
  3. Endpoints + S3 presigned-URL attachment flow
- **M5b — Frontend + tag** — single sub-plan, ~3 tasks:
  1. ClaimSubmitPage with file upload via presigned URLs
  2. MyClaimsPage (list + cancel) + FinanceQueuePage (mark-reimbursed)
  3. CHANGELOG + tag `v0.1.0-m5`

### Acceptance criteria (M5)

- [ ] Employee submits a claim with optional attachments; small amount → 2-step chain auto-selected
- [ ] Manager approves → claim moves to `manager_approved`; Finance approves → `finance_approved`; Finance marks reimbursed → `reimbursed`
- [ ] Reject at any level requires a comment; releases nothing (no balance to release for claims)
- [ ] Audit log appended at every transition; payroll_audit_ledger NOT touched (claims aren't payroll)
- [ ] Permission codes: `claim:create:self`, `claim:read:{self,team,finance,org}`, `claim:approve:{team,finance}`, `claim:reimburse:finance`, `claim:category:write`, `claim:policy:write` — 8 codes
- [ ] Catalogue grows from 58 → 66
- [ ] Frontend: ClaimSubmitPage + MyClaimsPage + FinanceQueuePage all functional

---

## M6 — Payslip + Payroll CSV import

**Spec reference:** spec §3 (`payroll_periods`, `payroll_components`, `payslips`), §4 (`/payslips/*`, `/payroll/*` endpoints).

**Goal:** First user of `payroll_audit_ledger` (M1b-4 created the table; M6 starts writing). HR uploads a payroll CSV, the system validates and previews, then publishes — generating a payslip PDF per employee and a chained ledger entry per payslip. Employees view their own payslips.

### Data model

```
payroll_periods(id, org_id, period_start, period_end, period_type, pay_date, status)
                status: draft|locked|published

payroll_components(id, org_id, code, name, type, is_statutory)
                   type: earning|deduction|employer_contribution

payslips(id, org_id, employee_id, period_id,
         gross, deductions JSONB, net, currency_code, components JSONB,
         pdf_s3_key, pdf_generated_at,
         status, published_at, sent_at, source)
         status: draft|published|sent
         source: csv_import|manual
         UNIQUE(employee_id, period_id)
```

### CSV format (committed in fixtures + documented)

Required columns:
```
employee_code,gross,net,components_json,deductions_json
PVT-001,5000.00,4250.00,"{""basic_salary"":5000}","{""epf_employee"":550,""socso_employee"":13.50,""eis_employee"":4.40,""pcb"":182.10}"
```

Validation:
- Each `employee_code` must exist in the org
- `gross - sum(deductions) ≈ net` (within 1 cent tolerance)
- Currency = org default
- All employees in the period have a row OR a flag for "skip this period"

### API endpoints

```
GET    /api/v1/payslips/me?period=
GET    /api/v1/payslips/{id}                returns metadata + signed S3 URL for PDF
GET    /api/v1/payroll/periods              hr/finance
POST   /api/v1/payroll/periods
POST   /api/v1/payroll/runs                 multipart CSV upload — status='draft'
POST   /api/v1/payroll/runs/{id}/preview    lint+sample (top 5 rows + diff)
POST   /api/v1/payroll/runs/{id}/publish    generates PDFs + writes payroll_audit_ledger entries + sends notification
GET    /api/v1/payroll/runs/{id}/errors     row-level validation errors
```

### File structure

```
apps/api/modules/payslip/
├── __init__.py, apps.py, models.py, admin.py
├── services/{period.py, csv_import.py, pdf_render.py, publish.py}
├── parsers/csv_parser.py                    fail-soft CSV parsing with row errors[]
├── templates/payslip.html                   WeasyPrint or ReportLab template
├── serializers.py, views.py, urls.py
├── migrations/
└── tests/

apps/web/src/modules/payslip/
├── api.ts, routes.tsx
└── pages/{MyPayslipsPage, PayrollAdminPage}.tsx

apps/api/pyproject.toml: + weasyprint OR reportlab
apps/api/modules/identity/fixtures/permissions_m6.yaml
```

### Sub-plans

- **M6a — Backend (models + CSV import + PDF + ledger)** — ~4 tasks:
  1. Models + permission seed
  2. CSV import service with row-level validation
  3. Payslip PDF rendering (WeasyPrint preferred for HTML→PDF; ReportLab acceptable)
  4. Publish service: generate PDFs, write `payroll_audit_ledger` per payslip, send notifications
- **M6b — Endpoints** — ~2 tasks:
  1. `/payslips/me`, `/payslips/{id}` (signed S3 URL)
  2. `/payroll/runs/*` admin endpoints (upload, preview, publish, errors)
- **M6c — Frontend + tag** — ~3 tasks:
  1. MyPayslipsPage (list + download PDF link)
  2. PayrollAdminPage (upload CSV, see preview, publish)
  3. CHANGELOG + tag `v0.1.0-m6`

### Acceptance criteria (M6)

- [ ] HR uploads a valid CSV → `/preview` shows row count + total gross/net + any errors
- [ ] HR clicks publish → payslip PDFs generated to S3, ledger rows written, employees notified
- [ ] Employee sees their payslip at `/me/payslips` with a download link (signed URL)
- [ ] `payroll_audit_ledger` chain verifies (`POST /audit/payroll-ledger/verify` returns OK)
- [ ] Re-publishing the same period is rejected (period.status='published')
- [ ] Permission codes: `payslip:read:{self,org}`, `payroll:run:{create,publish}`, `payroll:component:write` — 5 codes
- [ ] Catalogue 66 → 71
- [ ] CSV import is row-fail-soft (one bad row reports the error; doesn't abort the whole import)

---

## M7 — KPI

**Spec reference:** spec §3 (`kpi_templates`, `kpi_definitions`, `kpi_cycles`, `kpi_assignments`, `kpi_reviews`), §4 (`/kpi/*` endpoints).

**Goal:** Quarterly/annual KPI review cycles with self-review + manager-review iteration model. Templates are role/dept-scoped. Each cycle has assignments; each assignment carries a frozen snapshot of the KPI definitions at assign time so later edits to templates don't shift history.

### Data model

```
kpi_templates(id, org_id, name, description, applies_to_role_id NULL, applies_to_dept_id NULL)
kpi_definitions(id, template_id, code, name, description,
                metric_type, target, unit, weight, evidence_required, sort_order)
                metric_type: numeric|percentage|rating|boolean

kpi_cycles(id, org_id, name, type, starts_on, ends_on,
           review_opens_on, review_closes_on, status)
           type: quarterly|semi_annual|annual
           status: upcoming|self_review|manager_review|closed

kpi_assignments(id, cycle_id, employee_id, template_id,
                kpis JSONB,            -- frozen snapshot of definitions at assignment time
                status)
                status: pending|self_done|manager_done|closed

kpi_reviews(id, assignment_id,
            iteration,                  -- supports back-and-forth
            stage,                      -- self|manager|final
            scores JSONB,               -- {"<kpi_code>": {"score": 4.5, "comment": "..."}}
            overall_comment, evidence JSONB,  -- s3_keys[]
            submitted_by, submitted_at,
            ai_summary_id NULL)         -- Phase 2 hook (AIProviderPort)

kpi_review_iterations(id, review_id, change_summary JSONB, ts)
```

### API endpoints

```
GET    /api/v1/kpi/templates                   hr_manager+
POST   /api/v1/kpi/templates
GET    /api/v1/kpi/cycles                      ?status=
POST   /api/v1/kpi/cycles                      hr_manager+
POST   /api/v1/kpi/cycles/{id}/open-self-review
POST   /api/v1/kpi/cycles/{id}/open-manager-review
POST   /api/v1/kpi/cycles/{id}/close

GET    /api/v1/kpi/assignments/me?cycle_id=
GET    /api/v1/kpi/assignments?cycle_id=&employee_id=
POST   /api/v1/kpi/assignments                 bulk-assign template to employees

POST   /api/v1/kpi/reviews/{assignment_id}/self     scores + comment
POST   /api/v1/kpi/reviews/{assignment_id}/manager
POST   /api/v1/kpi/reviews/{assignment_id}/evidence multipart
GET    /api/v1/kpi/team-summary?cycle_id=          manager view
```

### File structure

```
apps/api/modules/kpi/
├── __init__.py, apps.py, models.py, admin.py
├── services/{template.py, cycle.py, assignment.py, review.py}
├── serializers.py, views.py, urls.py
├── migrations/
└── tests/

apps/web/src/modules/kpi/
├── api.ts, routes.tsx
└── pages/{MyKpiPage, KpiManagerPage, KpiAdminPage}.tsx

apps/api/modules/identity/fixtures/permissions_m7.yaml
```

### Sub-plans

- **M7a — Models + cycle state machine** — ~3 tasks:
  1. Models (templates, cycles, assignments, reviews) + permission seed
  2. Cycle state machine: `upcoming → self_review → manager_review → closed` + transition guards
  3. Assignment service: bulk-assign with template snapshot (deep-copy definitions into `kpis` JSONB)
- **M7b — Review submission + endpoints** — ~3 tasks:
  1. ReviewService: submit-self, submit-manager, evidence upload (S3 presigned)
  2. Endpoints (cycles + assignments + reviews + team-summary)
  3. Audit log integration (every review submit writes audit_log entry)
- **M7c — Frontend + tag** — ~3 tasks:
  1. MyKpiPage (list assignments, fill self-review)
  2. KpiManagerPage (list reports' assignments, fill manager-review)
  3. KpiAdminPage (templates + cycles management) + CHANGELOG + tag `v0.1.0-m7`

### Acceptance criteria (M7)

- [ ] HR creates a template with KPI definitions, then a cycle
- [ ] HR bulk-assigns the template to employees → snapshot captured in each assignment
- [ ] HR opens self-review phase → employees can submit their self-review
- [ ] HR opens manager-review phase → managers can submit manager-review
- [ ] HR closes the cycle → assignments locked
- [ ] All transitions audit-logged
- [ ] Permission codes: `kpi:cycle:{read,write}`, `kpi:template:{read,write}`, `kpi:assignment:{read:self,read:team,write:team}`, `kpi:review:{write:self,write:team}`, `kpi:team-summary:read:team` — 9 codes
- [ ] Catalogue 71 → 80
- [ ] Editing a template AFTER assignments are made does NOT change historical assignments (snapshot preserved)

---

## M8 — Certification + Training

**Spec reference:** spec §3 (`certifications`, `training_plans`, `training_assignments`, `training_progress`), §4 (`/certifications/*`, `/training/*` endpoints).

**Goal:** Track employee certifications with expiry-soon reminders (90/60/30 day windows, idempotent), training plans with assignments and progress tracking. Cron job that runs daily to detect upcoming expirations.

### Data model

```
certifications(id, org_id, employee_id, name, issuer, certificate_number,
               issued_on, expires_on, document_s3_key,
               status,                      -- active|expired|revoked
               reminder_sent_30d, reminder_sent_60d, reminder_sent_90d)

training_plans(id, org_id, name, description,
               required_for_role_id NULL, required_for_dept_id NULL)

training_assignments(id, plan_id, employee_id, assigned_by, due_date,
                     status,                -- assigned|in_progress|completed|overdue
                     completed_at, evidence_s3_key)

training_progress(id, assignment_id, progress_pct, notes, ts)
```

### Cron job

`detect_certification_expiry` runs daily (already scheduled in M0 Celery beat config):
- Finds certs where `expires_on - today` is in `{90, 60, 30}` AND the corresponding `reminder_sent_*` flag is False.
- Sends in-app + email notification to employee + manager.
- Sets the `reminder_sent_*` flag — idempotent (cron re-runs don't re-send).

`detect_training_overdue` runs daily:
- Finds assignments where `due_date < today` and `status != completed` → set `status='overdue'`, notify.

### API endpoints

```
GET    /api/v1/certifications/me
GET    /api/v1/certifications?employee_id=&expiring_within_days=
POST   /api/v1/certifications                       multipart
PATCH  /api/v1/certifications/{id}
DELETE /api/v1/certifications/{id}

GET    /api/v1/training/plans
POST   /api/v1/training/plans
GET    /api/v1/training/assignments/me
GET    /api/v1/training/assignments?status=overdue
POST   /api/v1/training/assignments
PATCH  /api/v1/training/progress/{id}
POST   /api/v1/training/assignments/{id}/complete   multipart evidence
```

### File structure

```
apps/api/modules/certification/
├── __init__.py, apps.py, models.py, admin.py
├── services/{certification.py, training.py, expiry_scan.py}
├── tasks.py                                Celery tasks
├── serializers.py, views.py, urls.py
├── migrations/
└── tests/

apps/web/src/modules/certification/
├── api.ts, routes.tsx
└── pages/{MyCertificationsPage, MyTrainingPage, AdminCertPage}.tsx

apps/api/modules/identity/fixtures/permissions_m8.yaml
```

### Sub-plans

- **M8a — Models + endpoints** — ~3 tasks:
  1. Certification + Training models + permission seed
  2. CertificationService + TrainingService
  3. CRUD endpoints + S3 presigned-URL doc upload flow
- **M8b — Expiry cron + notifications** — ~2 tasks:
  1. `expiry_scan.py` service + Celery task `detect_certification_expiry`
  2. Notifications wiring (existing M1b notification module + M9 finalization)
- **M8c — Frontend + tag** — ~2 tasks:
  1. MyCertificationsPage + MyTrainingPage + AdminCertPage
  2. CHANGELOG + tag `v0.1.0-m8`

### Acceptance criteria (M8)

- [ ] Employee uploads a cert document via `/certifications` POST
- [ ] HR sees all certs at `/certifications?expiring_within_days=90`
- [ ] Daily cron emits an in-app + email reminder when a cert is 90/60/30 days from expiring
- [ ] Re-running the cron the next day does NOT re-send for the same window (idempotent flags)
- [ ] Training plans assignable; progress trackable; auto-overdue when past `due_date`
- [ ] Permission codes: `cert:{read:{self,team,org},write:{self,org}}`, `training:plan:{read,write}`, `training:assignment:{read:self,write:team}`, `training:progress:write:self` — 9 codes
- [ ] Catalogue 80 → 89
- [ ] Frontend pages render cleanly

---

## Combined acceptance after M8

- [ ] All 9 milestones (M0–M8) shipped on master with annotated tags `v0.1.0-m{0..8}`
- [ ] Backend test count grew from 268 (post-M4) to ~400+ (M5 adds ~30, M6 ~25, M7 ~30, M8 ~25)
- [ ] Frontend test count: ~10+
- [ ] Permission catalogue: 89 codes
- [ ] All cron jobs registered in Celery beat schedule
- [ ] `payroll_audit_ledger` actively written-to from M6 onwards; verification endpoint returns OK

---

## Sequencing notes

- **M5** is the smallest of the four — workflow engine reuse means most of the heavy lifting was done in M3a. Probably ships in 2 sub-plans (~8 tasks).
- **M6** is the heaviest of the four — PDF rendering + CSV parsing + payroll-ledger writes + financial correctness. 3 sub-plans (~10 tasks). Take time on the CSV format spec to keep it stable for Phase 2 payroll providers.
- **M7** has subtle data-integrity requirements (snapshot the template at assign time; preserve historical reviews even if templates change).
- **M8** is mostly straightforward CRUD + a single cron job.

After M8, the remaining milestones (M9 notifications UX, M10 dashboards/approvals inbox, M11 reports, M12 hardening) are smaller because they build on top of what's already in place.

---

**Detailed plans authored on demand.** When ready to execute M5, say *"plan and execute M5"* — I'll author the M5a/b detailed step-by-step plans (~3000 lines combined) before dispatching the first implementer subagent.
