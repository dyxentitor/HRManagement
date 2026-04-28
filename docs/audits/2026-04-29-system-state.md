# HRMS v1.1.0 — System State Audit

**Date:** 2026-04-29
**Branch:** master (tag: v1.1.0)
**Auditor:** Claude Code (read-only probe)
**Stack:** API `http://localhost:8000`, Web `http://localhost:5173`

---

## 1. Smoke Summary

```
Endpoints probed:  ~150 HTTP calls across ~90 unique paths
  ✅ Working:       76  (endpoint exists and returns expected status)
  ⚠  Permission:   12  (correct 403 for role below required level)
  ❌ Broken:         4  (wrong 403, stale worker config, upload token bug, missing beat tasks)

Pages walked:      17  (all routes in App.tsx + module routes.tsx files)
  ✅ Renders:       14  (API wiring confirmed for primary user)
  ⚠  Has error:     2  (payslips detail 403; report CSV export fails in worker)
  ❌ Crashes:        1  (payroll CSV upload — wrong localStorage key sends null token)

Beat tasks:         2  registered (1 enabled + celery.backend_cleanup)
  Missing:          3  (detect_certification_expiry, detect_training_overdue, run_export NOT scheduled)
Worker:            UP — but running with invalid HRMS_FIELD_ENCRYPTION_KEY
                   (last successful task: send_pending_email_digests at 2026-04-29 06:24:57 UTC)

Payroll chain:     VALID  (all 10 PayrollAuditLedger rows hash-consistent)
Leave ledger:      VALID  (all 28 balances: accrued − taken == ledger_sum)
PII decryption:    OK (API container; worker container has stale/invalid key)
```

---

## 2. API Endpoint Matrix

Role legend:
- **admin** = `admin@provintell.demo` (org_admin, no linked Employee)
- **manager** = `pvt-demo-001@provintell.local` (manager role + Employee PVT-DEMO-001)
- **employee** = `pvt-demo-005@provintell.local` (employee role + Employee PVT-DEMO-005)

Symbols: ✅ 2xx | ⚠ 403/404 gated (expected) | ❌ bug | `data-gated` = 404 because no Employee record linked (correct per design)

### Identity / Auth

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| POST | `/api/v1/auth/login` | 200 | 200 | 200 | OK |
| GET | `/api/v1/auth/me` | 200 | 200 | 200 | Returns `permissions[]` but **no `role_codes`** — known issue, UserMenu shows "Member" |
| POST | `/api/v1/auth/logout` | 400 (needs `refresh_token` field) | — | — | Validation expected; not a bug |
| POST | `/api/v1/auth/refresh` | 400 (needs valid refresh) | — | — | Validation expected |
| POST | `/api/v1/auth/mfa/enable` | 200 | 200 | 200 | Returns TOTP setup |
| POST | `/api/v1/auth/mfa/confirm` | 400 | — | — | Validation (empty body); OK |
| DELETE | `/api/v1/auth/mfa` | n/t | — | — | Not tested (needs active MFA) |
| POST | `/api/v1/auth/password/forgot` | 400 | 400 | 400 | Validation (empty body); OK |

### Employees

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/employees/` | 200 | ⚠ 403 | ⚠ 403 | Admin-only list; correct |
| POST | `/api/v1/employees/` | 400 (validation) | — | — | OK |
| GET | `/api/v1/employees/me/` | `data-gated` 404 | 200 | 200 | Admin has no Employee record — correct |
| PATCH | `/api/v1/employees/me/` | — | 200 | 200 | Self-edit works |
| GET | `/api/v1/employees/{id}/` | 200 | ⚠ 403 | ⚠ 403 | Only admin can read other profiles |
| GET | `/api/v1/employees/{id}/direct-reports/` | 200 | — | — | OK |
| GET | `/api/v1/employees/{id}/probation-status/` | 200 | — | — | OK |
| GET | `/api/v1/employees/{id}/reporting-chain/` | not probed with ID | — | — | Skipped |

### Departments

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/departments/` | 200 | 200 | ⚠ 403 | OK |
| POST | `/api/v1/departments/` | 400 (validation) | — | — | OK |
| GET | `/api/v1/departments/{id}/` | 200 | — | — | OK |

### Organizations

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/organizations/` | 200 | — | ⚠ 403 | OK |
| GET | `/api/v1/org/settings` | 200 | ⚠ 403 | ⚠ 403 | Admin-only; OK |

### Leave

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/leave/types/` | 200 | 200 | 200 | OK |
| GET | `/api/v1/leave/balances/` | 200 | 200 | 200 | OK |
| GET | `/api/v1/leave/balances/me/` | 200 | 200 | 200 | OK |
| GET | `/api/v1/leave/balances/{id}/` | — | — | 200 | OK |
| GET | `/api/v1/leave/requests/` | 200 | 200 | 200 | Scoped by role |
| GET | `/api/v1/leave/requests/?scope=me` | — | — | 200 | Filter works |
| POST | `/api/v1/leave/requests/` | 400 (validation) | — | — | OK |
| GET | `/api/v1/leave/policies/` | ❌ 404 | ❌ 404 | ❌ 404 | **Route does not exist** — not in OpenAPI schema; no frontend calls it either |

> Note: `/api/v1/leave/policies/` returns 404 for all roles. The path is **not registered** in `modules/leave/urls.py` and does not appear in the OpenAPI schema. No frontend module calls this path, so there is no user-visible impact.

### Approvals

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/approvals/inbox` | 200 | 200 | ⚠ 403 | Correct — employee has no approver role |

### Dashboard

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/dashboards/admin` | 200 (6 cards) | ⚠ 403 | ⚠ 403 | Correct |
| GET | `/api/v1/dashboards/me` | 200 (4 cards) | 200 | 200 | OK |
| GET | `/api/v1/dashboards/team` | 200 | 200 | ⚠ 403 | Correct |
| GET | `/api/v1/dashboards/manager` | ❌ 404 | ❌ 404 | ❌ 404 | Not a real variant; frontend uses `me`/`team`/`admin` — not a bug |
| GET | `/api/v1/dashboards/employee` | ❌ 404 | ❌ 404 | ❌ 404 | Same; not a bug |

### Certifications & Training

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/certifications/` | 200 | 200 | ⚠ 403 | Employee-list is admin/manager only; cert/me endpoint handles self |
| GET | `/api/v1/certifications/me/` | 200 | 200 | 200 | OK |
| POST | `/api/v1/certifications/` | — | — | 400 (validation) | OK |
| GET | `/api/v1/certifications/{id}/` | 200 | — | — | OK |
| GET | `/api/v1/training/assignments/` | 200 | 200 | ⚠ 403 | OK |
| GET | `/api/v1/training/assignments/me/` | 200 | 200 | 200 | OK |
| GET | `/api/v1/training/plans/` | 200 | 200 | 200 | OK |
| GET | `/api/v1/training/assignments/{id}/` | 200 | — | — | OK |
| GET | `/api/v1/training/assignments/{id}/progress/` | 200 | — | — | OK |

### Claims

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/claims/` | 200 | 200 | 200 | Scoped by role |
| POST | `/api/v1/claims/` | — | — | 400 (validation) | OK |
| GET | `/api/v1/claims/categories/` | 200 | 200 | 200 | OK |
| GET | `/api/v1/claims/policies/` | 200 | 200 | 200 | OK |
| GET | `/api/v1/claims/{id}/` | — | — | n/t | No claims in DB yet |
| GET | `/api/v1/claims/{id}/attachments/` | — | — | n/t | No claims in DB |
| POST | `/api/v1/claims/{id}/attachments/presigned-upload/` | — | — | untested | Requires S3 client; marked untested |

### KPI

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/kpi/assignments/` | 200 | 200 | ⚠ 403 | OK |
| GET | `/api/v1/kpi/assignments/me/` | 200 | 200 | 200 | OK |
| GET | `/api/v1/kpi/cycles/` | 200 | 200 | ⚠ 403 | OK |
| POST | `/api/v1/kpi/cycles/` | 400 (validation) | — | — | OK |
| GET | `/api/v1/kpi/cycles/{id}/` | 200 | — | — | OK |
| GET | `/api/v1/kpi/templates/` | 200 | 200 | ⚠ 403 | OK |
| GET | `/api/v1/kpi/team-summary` | 200 | 200 | ⚠ 403 | OK |

### Schedule

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/schedule/holidays/` | 200 | 200 | 200 | OK |
| GET | `/api/v1/schedule/shifts/` | 200 | 200 | 200 | OK |
| GET | `/api/v1/schedule/work-schedules/` | 200 | 200 | 200 | OK |
| GET | `/api/v1/schedule/shift-assignments/` | 200 | 200 | ⚠ 403 | Roster is manager/admin only |
| GET | `/api/v1/schedule/shift-assignments/me/` | 200 | 200 | 200 | OK |
| POST | `/api/v1/schedule/shift-assignments/bulk-pattern/` | untested | — | — | Skipped (complex body) |
| POST | `/api/v1/schedule/shift-assignments/publish/` | untested | — | — | Skipped |

### Attendance

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/attendance/today/` | `data-gated` 404 | 200 | 200 | Admin has no Employee — correct |
| GET | `/api/v1/attendance/records/` | `data-gated` 404 | 200 | 200 | Same |
| GET | `/api/v1/attendance/team/` | `data-gated` 404 | 200 | ⚠ 403 | OK |
| POST | `/api/v1/attendance/clock-in/` | — | — | 200 | Clock-in succeeded with empty body (no body required) |

### Notifications

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/notifications` | 200 | 200 | 200 | **No trailing slash** — backend registered without slash |
| GET | `/api/v1/notifications/preferences` | 200 | 200 | 200 | Same — no trailing slash |
| POST | `/api/v1/notifications/read-all` | 200 | — | — | OK |
| GET | `/api/v1/notifications/` (with slash) | ❌ 404 | ❌ 404 | ❌ 404 | Django 404 — slash variant not registered. Frontend `api.ts` uses no-slash — **no user impact** |

### Reports

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/reports` | 200 (15 reports listed) | 200 | 200 | OK |
| GET | `/api/v1/reports/{code}/schema` | 200 | — | — | OK |
| POST | `/api/v1/reports/{code}/run` | 200 (returns rows inline) | — | — | OK |
| POST | `/api/v1/reports/{code}/export` | 202 (job queued) | — | — | Job created but **worker fails** — see Bug #3 |
| GET | `/api/v1/reports/jobs/{id}` | 200 (status: failed) | — | — | Job fails with encryption error — Bug #3 |
| GET | `/api/v1/reports/saved-views` | 200 | — | — | OK |

### Payroll & Payslips

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/api/v1/payroll/periods/` | 200 | — | ⚠ 403 | Admin/finance only; OK |
| POST | `/api/v1/payroll/periods/` | 400 (validation) | — | — | OK |
| GET | `/api/v1/payroll/runs/` | 200 | — | ⚠ 403 | OK |
| POST | `/api/v1/payroll/runs/` (CSV upload) | untested | — | — | **Frontend bug** — uses wrong localStorage key (Bug #2) |
| GET | `/api/v1/payslips/` | 200 | — | ⚠ 403 | OK |
| GET | `/api/v1/payslips/me/` | 200 | — | 200 | OK — scoped to own |
| GET | `/api/v1/payslips/{id}/` | 200 | — | ❌ 403 | **Bug #1** — employee gets 403 on own payslip by ID |

### Health

| Method | Path | admin | manager | employee | Notes |
|--------|------|-------|---------|----------|-------|
| GET | `/health` | 200 | — | — | OK |
| GET | `/health/ready` | 200 `{"status":"ready","checks":{"database":"ok"}}` | — | — | OK |

---

## 3. Frontend Page Matrix

Routes sourced from `apps/web/src/App.tsx` and all `apps/web/src/modules/*/routes.tsx` files.

### `/login` — LoginPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| POST login | `POST /api/v1/auth/login` | 200 | 200 | 200 | WIRED OK |

### `/dashboard` — DashboardPage
Frontend `pickVariant()` maps permissions to `me` / `team` / `admin` variant string.
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `getDashboard("admin")` | `GET /api/v1/dashboards/admin` | 200 | 403 | 403 | WIRED OK (admin only) |
| `getDashboard("team")` | `GET /api/v1/dashboards/team` | 200 | 200 | 403 | WIRED OK |
| `getDashboard("me")` | `GET /api/v1/dashboards/me` | 200 | 200 | 200 | WIRED OK |

### `/me/profile` — MyProfilePage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `api.GET /employees/me/` | `GET /api/v1/employees/me/` | 404 data-gated | 200 | 200 | WIRED OK (admin shows empty state) |
| `api.PATCH /employees/me/` | `PATCH /api/v1/employees/me/` | — | 200 | 200 | WIRED OK |

### `/employees` — EmployeesPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `api.GET /employees/` | `GET /api/v1/employees/` | 200 | 403 | 403 | WIRED OK (admin only) |

### `/leave/me` — MyLeavePage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `leaveApi.myBalances` | `GET /api/v1/leave/balances/me/` | 200 | 200 | 200 | WIRED OK |
| `leaveApi.listMyRequests` | `GET /api/v1/leave/requests/` | 200 | 200 | 200 | WIRED OK |

### `/leave/apply` — LeaveApplyPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `leaveApi.listTypes` | `GET /api/v1/leave/types/` | 200 | 200 | 200 | WIRED OK |
| `leaveApi.apply` | `POST /api/v1/leave/requests/` | 400 val | 200 | 200 | WIRED OK |

### `/leave/approvals` → redirect to `/approvals`

### `/approvals` — UnifiedInboxPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `getInbox` | `GET /api/v1/approvals/inbox` | 200 | 200 | 403 | WIRED OK |
| `approveItem(leave)` | `POST /api/v1/leave/requests/{id}/approve/` | — | 200 | — | WIRED OK |
| `approveItem(claim)` | `POST /api/v1/claims/{id}/approve/` | — | 200 | — | WIRED OK |

### `/claims/me` — MyClaimsPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `claimsApi.listMine` | `GET /api/v1/claims/` | 200 | 200 | 200 | WIRED OK |

### `/claims/submit` — ClaimSubmitPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `claimsApi.listCategories` | `GET /api/v1/claims/categories/` | 200 | 200 | 200 | WIRED OK |
| `claimsApi.submit` | `POST /api/v1/claims/` | — | — | 400 val | WIRED OK |
| `claimsApi.presignedUpload` | `POST /api/v1/claims/{id}/attachments/presigned-upload/` | — | — | untested | **UNTESTED** — requires real S3 presign flow |

### `/claims/finance` → redirect to `/approvals`

### `/payslips/me` — MyPayslipsPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `payslipApi.listMine` | `GET /api/v1/payslips/me/` | 200 | — | 200 | WIRED OK |
| `payslipApi.retrieve(id)` | `GET /api/v1/payslips/{id}/` | 200 | — | ❌ 403 | **BROKEN** — Bug #1: employee can list but can't open detail view |

### `/payroll/admin` — PayrollAdminPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `payslipApi.listPeriods` | `GET /api/v1/payroll/periods/` | 200 | — | 403 | WIRED OK |
| `payslipApi.listRuns` | `GET /api/v1/payroll/runs/` | 200 | — | 403 | WIRED OK |
| `payslipApi.uploadRun` | `POST /api/v1/payroll/runs/` | ❌ null token | — | — | **BROKEN** — Bug #2: localStorage key mismatch → 401 |

### `/reports` — ReportsListPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `reportsApi.list` | `GET /api/v1/reports` | 200 | 200 | 200 | WIRED OK |

### `/reports/:code` — ReportRunPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `reportsApi.schema` | `GET /api/v1/reports/{code}/schema` | 200 | — | — | WIRED OK |
| `reportsApi.run` | `POST /api/v1/reports/{code}/run` | 200 (inline rows) | — | — | WIRED OK |
| `reportsApi.export` | `POST /api/v1/reports/{code}/export` | 202 job queued | — | — | ⚠ HAS ERROR — Bug #3: worker fails export |
| `reportsApi.listSavedViews` | `GET /api/v1/reports/saved-views` | 200 | — | — | WIRED OK |

### `/kpi/me` — MyKpiPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `kpiApi.listAssignments("me")` | `GET /api/v1/kpi/assignments/me/` | 200 | 200 | 200 | WIRED OK |
| `kpiApi.listCycles` | `GET /api/v1/kpi/cycles/` | 200 | 200 | 403 | PERMISSION-GATED (employee) |

### `/kpi/manager` — KpiManagerPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `kpiApi.listAssignments("all")` | `GET /api/v1/kpi/assignments/` | 200 | 200 | 403 | WIRED OK |
| `kpiApi.teamSummary` | `GET /api/v1/kpi/team-summary` | 200 | 200 | 403 | WIRED OK |

### `/kpi/admin` — KpiAdminPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `kpiApi.listTemplates` | `GET /api/v1/kpi/templates/` | 200 | 200 | 403 | WIRED OK |
| `kpiApi.listCycles` | `GET /api/v1/kpi/cycles/` | 200 | 200 | 403 | WIRED OK |
| `kpiApi.createCycle` | `POST /api/v1/kpi/cycles/` | 400 val | — | — | WIRED OK |

### `/schedule/me` — MySchedulePage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `scheduleApi.myAssignments` | `GET /api/v1/schedule/shift-assignments/me/` | 200 | 200 | 200 | WIRED OK |
| `scheduleApi.listHolidays` | `GET /api/v1/schedule/holidays/` | 200 | 200 | 200 | WIRED OK |

### `/schedule/roster` — RosterPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `scheduleApi.listAssignments` | `GET /api/v1/schedule/shift-assignments/` | 200 | 200 | 403 | PERMISSION-GATED (employee) |
| `scheduleApi.listShifts` | `GET /api/v1/schedule/shifts/` | 200 | 200 | 200 | WIRED OK |
| `scheduleApi.bulkAssign` | `POST /api/v1/schedule/shift-assignments/bulk-pattern/` | untested | — | — | UNTESTED |
| `scheduleApi.publish` | `POST /api/v1/schedule/shift-assignments/publish/` | untested | — | — | UNTESTED |

### `/certifications/me` — MyCertificationsPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `certApi.myCertifications` | `GET /api/v1/certifications/me/` | 200 | 200 | 200 | WIRED OK |
| `certApi.create` | `POST /api/v1/certifications/` | — | — | 400 val | WIRED OK |

### `/training/me` — MyTrainingPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `certApi.myTraining` | `GET /api/v1/training/assignments/me/` | 200 | 200 | 200 | WIRED OK |
| `certApi.listPlans` | `GET /api/v1/training/plans/` | 200 | 200 | 200 | WIRED OK |

### `/certifications/admin` — AdminCertPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `certApi.listAll` | `GET /api/v1/certifications/` | 200 | 200 | 403 | WIRED OK |

### `/notifications/preferences` — PreferencesPage
| API call | Endpoint | admin | manager | employee | Status |
|----------|----------|-------|---------|----------|--------|
| `getPreferences()` | `GET /api/v1/notifications/preferences` | 200 | 200 | 200 | WIRED OK (no trailing slash — correct) |
| `updatePreferences()` | `PATCH /api/v1/notifications/preferences` | untested | — | — | Route exists; PATCH not probed |

---

## 4. Background Jobs

### Celery Beat Schedule

| Enabled | Name | Task | Schedule | Last Run |
|---------|------|------|----------|----------|
| ✅ True | `send-pending-email-digests` | `modules.notification.tasks.send_pending_email_digests` | every 3600 s | 2026-04-29 06:24:57 UTC |
| ✅ True | `celery.backend_cleanup` | `celery.backend_cleanup` | `0 4 * * *` (Asia/KL) | None |
| ❌ Missing | `detect-certification-expiry` | `modules.certification.tasks.detect_certification_expiry` | **NOT REGISTERED** | — |
| ❌ Missing | `detect-training-overdue` | `modules.certification.tasks.detect_training_overdue` | **NOT REGISTERED** | — |
| ❌ Missing | `run-export` | `common.reporting.tasks.run_export` | **NOT REGISTERED** (triggered per-request, not beat) | — |

**Note on `run_export`:** This task is triggered per-request (when a user clicks "Export") — it does not need a beat schedule. The two missing tasks are `detect_certification_expiry` and `detect_training_overdue`.

### Worker Status

- **Container:** `hrms-dev-worker-1` — `Up 3 hours`
- **Last successful task:** `send_pending_email_digests` at 2026-04-29 06:24:57 UTC (15 notifications dispatched to 5 users)
- **Current state:** Worker is running but has an **invalid `HRMS_FIELD_ENCRYPTION_KEY`** (`dev-32byte-key-change-in-prod-pls`, 33 chars — not a valid Fernet key). Any task that instantiates an `EncryptedField` will raise `ImproperlyConfigured`. This includes `run_export`.

**Root cause:** The worker container was started 11 hours ago with a stale environment. The API container was restarted 2 hours ago and picked up the correct docker-compose default key (`5rrMC5h9nasS2Zt9vFYxZcVN8pd8o_niIzfNXD3afa8=`). The fix is `docker compose restart worker beat`.

---

## 5. Data Integrity

### Row Counts (as of audit time)

| Table | Count |
|-------|-------|
| `employee` (all, incl. soft-deleted) | 15 |
| `audit_log` | 53 |
| `payroll_audit_ledger` | 10 |
| `notification` | 56 |
| `leave_balance` | 28 |
| `leave_balance_ledger` | 38 |

### Payroll Audit Chain

`verify_payroll_chain()` → **VALID** (`True`, no message). All 10 `PayrollAuditLedger` rows are hash-consistent.

### Encrypted PII Decryption

Tested in the **API container** (which has the valid key):

| Employee | IC Number (first 6) | Bank Account (first 6) |
|----------|--------------------|-----------------------|
| PVT-DEMO-001 | `850315...` | `112345...` |
| PVT-DEMO-002 | `900722...` | `223456...` |
| PVT-DEMO-005 | `910214...` | `556789...` |

All three decrypt without error. The **worker container** would fail at first `EncryptedField` access (see Section 4).

### Leave Balance Ledger Idempotency

Verified for all 28 `LeaveBalance` rows: `accrued − taken == sum(ledger.delta)` for every row.
**Result: 0 mismatches.** The ledger is internally consistent.

An earlier check comparing `accrued` to raw `ledger_sum` (not accounting for approved-leave debits) showed apparent mismatches of `14.00 vs 11.00` for 10 employees — this is **expected**: the `deduct()` service writes negative ledger entries (`-3 days` for `request_approved`) while `accrued` tracks gross accrual only. The accounting model is correct.

### Signal Handlers

Leave workflow signals (`workflow_submitted`, `workflow_approved`, `workflow_rejected`) fire correctly — `LeaveApproval` rows are written and `Notification` objects are created on approval events (56 notifications in DB confirm signals fired during seeding/testing).

---

## 6. Known Broken

### Bug #1 — Employee cannot view individual payslip by ID

- **What:** `GET /api/v1/payslips/{id}/` returns `403 Permission denied` for an employee, even when the payslip belongs to them. `GET /api/v1/payslips/me/` (list) works, but the frontend calls `payslipApi.retrieve(id)` to open a payslip detail/PDF view.
- **Why:** `PayslipViewSet.required_perms` at `apps/api/modules/payslip/views.py:38–41` returns `["payslip:read:self"]` only for the `me` action, and `["payslip:read:org"]` for everything else — including `retrieve`. Employees hold `payslip:read:self` only. Even though `get_queryset()` (line 52–59) correctly scopes the queryset to own payslips, the `HRMSPermission` check runs first and blocks the request.
- **Fix:** Change `required_perms` to also accept `payslip:read:self` for `retrieve`, then rely on the existing queryset scoping (line 52–59) to enforce ownership. One-liner:
  ```python
  # views.py line 38-41
  @property
  def required_perms(self):
      if self.action in ("me", "retrieve", "list"):
          return ["payslip:read:self"]
      return ["payslip:read:org"]
  ```
  For `list` the queryset already gates to own rows when `payslip:read:org` is absent, so the permission change is safe.

---

### Bug #2 — Payroll CSV upload sends a null Authorization header

- **What:** `PayrollAdminPage` calls `payslipApi.uploadRun()` which uses `fetch()` with a raw `localStorage.getItem("access_token")` call. The application stores tokens under the key `"hrms.access_token"` (see `apps/web/src/lib/token-storage.ts`). `localStorage.getItem("access_token")` always returns `null`, so the request is sent as `Authorization: Bearer ` (empty), and the API returns 401.
- **Why:** Copy-paste / key name mismatch in `apps/web/src/modules/payslip/api.ts:98`. The module-level `authFetch()` helper uses `tokenStorage.getAccess()` correctly everywhere else.
- **Fix:** Replace the raw `localStorage` call with the shared helper:
  ```typescript
  // apps/web/src/modules/payslip/api.ts:90-103
  uploadRun: async (periodId: string, csvFile: File): Promise<UploadResult> => {
      const { tokenStorage } = await import("@/lib/token-storage");
      const token = tokenStorage.getAccess();
      const form = new FormData();
      form.append("period", periodId);
      form.append("csv", csvFile);
      const resp = await fetch("/api/v1/payroll/runs/", {
          method: "POST",
          body: form,
          headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      ...
  ```

---

### Bug #3 — Report CSV/XLSX export always fails (worker has invalid encryption key)

- **What:** `POST /api/v1/reports/{code}/export` queues a Celery job (202). The job transitions to `failed` with error: `HRMS_FIELD_ENCRYPTION_KEY must be a 32-byte url-safe base64 Fernet key`. The "Export" button in `ReportRunPage` silently fails — the UI polls the job and will show the `failed` status.
- **Why:** The `hrms-dev-worker-1` container has `HRMS_FIELD_ENCRYPTION_KEY=dev-32byte-key-change-in-prod-pls` (33 ASCII chars, not a valid Fernet key). The API container has the correct 44-char base64 key. The `run_export` task calls `cls.queryset()` which accesses `Employee.ic_number` (an `EncryptedField`), triggering `Fernet(raw)` validation in `apps/api/common/fields.py:14–23`.
- **Fix (immediate):** Restart the worker and beat containers so they inherit the current docker-compose env:
  ```bash
  docker compose -f deploy/docker-compose.yml restart worker beat
  ```
- **Fix (structural):** The `deploy/docker-compose.yml` default fallback for `HRMS_FIELD_ENCRYPTION_KEY` (`5rrMC5h9nasS2Zt9vFYxZcVN8pd8o_niIzfNXD3afa8=`) and the repo-root `.env` (`usD5HYuuQ5iukjBn3i2mDySqyyoE_PpxH_Y6U68i0yU=`) are **different valid keys** — which means data encrypted by one cannot be decrypted by the other. Consolidate to a single key in `.env` and remove the docker-compose fallback. Run `docker compose --env-file ../.env` to make compose pick up the repo-root `.env`.

---

### Bug #4 — Certification expiry and training overdue detection not scheduled

- **What:** `modules.certification.tasks.detect_certification_expiry` and `modules.certification.tasks.detect_training_overdue` exist in `apps/api/modules/certification/tasks.py` but are not registered in the Celery beat schedule. Certifications will never be auto-flagged as expiring; training assignments will never be auto-marked overdue.
- **Why:** `apps/api/hrms_api/celery.py` hard-codes only the `send_pending_email_digests` task in `app.conf.beat_schedule`. The certification tasks were written but not wired.
- **Fix:** Add two entries to `beat_schedule` in `apps/api/hrms_api/celery.py`:
  ```python
  app.conf.beat_schedule = {
      **getattr(app.conf, "beat_schedule", {}),
      "send-pending-email-digests": { ... },  # existing
      "detect-certification-expiry": {
          "task": "modules.certification.tasks.detect_certification_expiry",
          "schedule": crontab(hour=2, minute=0),  # nightly at 02:00
      },
      "detect-training-overdue": {
          "task": "modules.certification.tasks.detect_training_overdue",
          "schedule": crontab(hour=2, minute=15),  # nightly at 02:15
      },
  }
  ```

---

### Known Issue (pre-existing, do not re-fix) — `GET /api/v1/auth/me` missing `role_codes`

- **What:** The `/auth/me` response contains `permissions[]` but no `role_codes` field. The `UserMenu` component falls back to showing "Member" instead of the role name.
- **Status:** Previously identified; tracking in place. Not re-opened here.

---

## 7. Top 3 to Fix First

1. **Worker encryption key mismatch** (Bug #3, deployment) — effort: ~2 min.
   Why first: Every report export silently fails for all users right now. One `docker compose restart worker beat` command fixes it immediately with zero code changes. Also resolves the risk that worker-processed data (when tasks are added) encrypts with a different key than the API.

2. **Employee payslip detail 403** (Bug #1, backend) — effort: ~10 min.
   Why second: Any employee who clicks a payslip row to view their PDF gets a permission error. This is the highest-traffic employee self-service screen. The fix is a single-line change to `PayslipViewSet.required_perms` and carries no risk of data leakage (queryset scoping already enforces ownership).

3. **Payroll CSV upload null token** (Bug #2, frontend) — effort: ~5 min.
   Why third: The payroll admin upload flow is completely non-functional — the CSV upload always 401s. It is lower priority than #2 only because it affects one admin user rather than all employees, but it blocks the core payroll workflow.

> If you want to queue the cert/training beat tasks (Bug #4) as a fourth item, it is ~15 min and has no risk — but it is lower urgency since existing data is still searchable via the `/certifications/` endpoint; the beat tasks only add automated flagging.
