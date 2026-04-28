# Changelog

All notable changes documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0-m11] - 2026-04-28

### Added
- **M11 — Reports framework + 15 reports + frontend:** New `common.reporting` package providing a generic `Report` base class, `REGISTRY` dict, `@register` decorator, `SavedView` and `ReportExportJob` models (migrations included). Each contributing module ships a `reports.py`; `ReportingConfig.ready()` auto-imports them so registration happens on startup with no manual wiring.
- **Exporters:** `CSVExporter` (sync), `XLSXExporter` (openpyxl), `PDFExporter` (ReportLab). `run_export` Celery task queries → renders → uploads to S3 → updates job status + sets `s3_key`. Poll endpoint generates a 1-hour presigned download URL.
- **Endpoints:** `GET /api/v1/reports` (list visible), `GET /reports/{code}/schema` (filter + column spec for UI), `POST /reports/{code}/run` (paginated, server-side), `POST /reports/{code}/export` (async, returns `job_id`), `GET /reports/jobs/{id}` (poll), `GET/POST/DELETE /reports/saved-views` (user-scoped filter bookmarks).
- **15 reports registered:** `leave.balance_summary`, `leave.taken_period`, `leave.pending_approvals` (leave module); `attendance.daily_summary`, `attendance.late_absent_log`, `attendance.hours_worked` (attendance module); `claims.pending_by_approver`, `claims.spend_by_category`, `claims.reimbursement_status` (claims module); `kpi.cycle_progress` (KPI module); `cert.expiring_soon` (certification module); `headcount.snapshot` (employee module); `hrops.probation_ending`, `hrops.contract_ending`, `hrops.birthdays_this_month` (employee module, HR-ops sub-group).
- Frontend: `ReportsListPage` at `/reports` lists available reports grouped by module prefix. Generic `ReportRunPage` at `/reports/:code` introspects `/schema`, renders dynamic filter inputs (date/text/number/select), runs the report on submit, renders a paginated table with column headers from schema, shows CSV/XLSX/PDF export buttons that poll until done and expose a download link. TopBar "Reports" link gated on `report:list` perm.
- 4 new permission codes (M11): `report:list`, `report:run`, `report:export`, `report:saved_view:write`. Catalogue grew from 101 to 105. All roles get `report:list` + `report:run` + `report:saved_view:write`; `report:export` gated to manager+ / finance / hr_manager / org_admin / auditor.

## [0.1.0-m10] - 2026-04-28

### Added
- **M10 — Dashboards + Unified Approvals Inbox:** New `modules.dashboard` module (no DB models — pure service layer). `/api/v1/approvals/inbox` merges `LeaveApproval` + `ClaimApproval` pending rows for the current user, sorted newest-first, returning `{kind, id, employee_code, summary, submitted_at, deep_link}` items. `/api/v1/dashboards/{me,team,admin}` returns role-filtered `{variant, cards:[]}` payload; each card (`pending_approvals`, `my_leave_balance`, `upcoming_holidays`, `certs_expiring_team`, `kpi_cycle_progress_team`, `today_attendance_team`, `recent_claims_self`, `birthdays_this_month`) is a small self-contained fetcher (~25 lines) under `services/cards/`. Cards are visibility-gated by `is_visible_for()` (checks `requires_perms` against `get_user_perms()`). `DASHBOARD_CARDS` dict defines ordered card lists per variant; `CARD_TYPES` dict is the card registry.
- Frontend: `UnifiedInboxPage` at `/approvals` replaces M3d's `/leave/approvals` + M5b's `/claims/finance` (those routes now `<Navigate>` redirect). TopBar "Approvals" link updated to `/approvals` gated on `approvals:inbox:read`. `DashboardPage` at `/` is now role-aware: introspects user perms to pick highest available variant (`admin > team > me`), fetches the matching endpoint, and renders typed card components (8 components in `components/cards/`). Users with no dashboard permission see a fallback message.
- 4 new permission codes (M10): `dashboard:read:me`, `dashboard:read:team`, `dashboard:read:admin`, `approvals:inbox:read`. Catalogue grew from 97 to 101. Default roles updated: all roles get `dashboard:read:me`; manager/team_lead/hr_manager/org_admin get `dashboard:read:team` + `approvals:inbox:read`; hr_manager/org_admin get `dashboard:read:admin`; finance gets `approvals:inbox:read`; auditor gets all three dashboard:read variants.

## [0.1.0-m9] - 2026-04-28

### Added
- **M9 -- Notifications module:** `Notification`/`NotificationPreference`/`EmailDigestRun` models. `notify()` service that respects user preferences (security-relevant types always send). Default preferences seeded on user create via `post_save` signal. Hourly Celery digest task batches pending email notifications. Endpoints `/api/v1/notifications/*` (list, read, read-all, preferences GET+PATCH). Frontend: `NotificationBell` + `NotificationPanel` (slide-over grouped Today/Yesterday/Older) + `PreferencesPage` (type x channel toggle matrix). Existing modules (leave, claims, KPI, certification) now call `notify()` on domain events. 3 new permission codes -- catalogue 94 to 97.

## [0.1.0-m8] - 2026-04-28

### Added
- **M8 — Certification + Training:** `Certification`, `TrainingPlan`, `TrainingAssignment`, `TrainingProgress` models. `Certification` tracks employee credentials with `issued_on`/`expires_on`, S3 document key, status (`active`/`expired`/`revoked`), and three idempotent reminder flags (`reminder_sent_{30,60,90}d`). `TrainingAssignment` links employees to `TrainingPlan` with `status` FSM (`assigned → in_progress → completed / overdue`); `TrainingProgress` stores per-assignment progress percentages.
- `scan_certification_expiry` service: exact-day match against `{30, 60, 90}` day windows; sets flag before notify so re-runs are idempotent (no double-send). Certs past `expires_on` are auto-transitioned to `expired`. `detect_certification_expiry` + `detect_training_overdue` Celery tasks wrap the services for daily cron invocation.
- Endpoints: `GET/POST /api/v1/certifications/`, `GET /api/v1/certifications/me/`, `POST /{id}/document/presigned-upload`, `POST /{id}/document` (register after upload), `GET/POST /api/v1/training/plans/`, `GET/POST /api/v1/training/assignments/`, `GET /api/v1/training/assignments/me/`, `POST /assignments/{id}/complete/`, `GET /assignments/{id}/progress/`, `POST /training/progress/`.
- Frontend: `MyCertificationsPage` (list with expiry colour badges: red <30d, amber <60d, green active; add-cert form), `MyTrainingPage` (list assignments + progress slider + Mark Complete button), `AdminCertPage` (all certs with expiry-window filter 30/60/90/180 days; training plan management). TopBar nav: "Certs" (`cert:read:self`), "Training" (`training:assignment:read:self`), "Cert Admin" (`cert:read:org`).
- 10 new permission codes (M8): `cert:read:{self,team,org}`, `cert:write:{self,org}`, `training:plan:{read,write}`, `training:assignment:{read:self,write:team}`, `training:progress:write:self`. Catalogue grew from 84 to 94.

## [0.1.0-m7] - 2026-04-28

### Added
- **M7 — KPI review cycles:** `KpiTemplate`, `KpiDefinition`, `KpiCycle`, `KpiAssignment`, `KpiReview`, `KpiReviewIteration` models. Cycle state machine: `upcoming → self_review → manager_review → closed` (HR-driven). **Snapshot invariant:** at bulk-assign time, template definitions are deep-copied into `assignment.kpis` JSONB — editing the template later never shifts historical reviews. Decimal values serialized to strings for JSON safety. Iteration pattern: `KpiReview.iteration` auto-increments via `max(iteration)+1` query so multiple review rounds are tracked.
- `CycleService`: `VALID_TRANSITIONS` dict + `transition()` raising `InvalidTransition` for illegal moves. `AssignmentService`: `bulk_assign()` + `_snapshot_definitions()`. `ReviewService`: `submit_self()` (guarded: cycle must be `self_review`), `submit_manager()` (guarded: cycle must be `manager_review` AND assignment must be `self_done`), `submit_evidence()` (S3 presigned PUT), `register_evidence()`. All submits write an `audit_log` row via `common.audit.append`.
- Endpoints: `GET/POST /api/v1/kpi/templates/`, `GET/POST /api/v1/kpi/cycles/` + cycle state-transition actions (`open-self-review`, `open-manager-review`, `close`), `GET/POST /api/v1/kpi/assignments/` + `me` action, `POST /api/v1/kpi/reviews/{id}/self|manager|evidence`, `GET /api/v1/kpi/team-summary`.
- Frontend: `MyKpiPage` (list own assignments + self-review form per-KPI), `KpiManagerPage` (team assignments awaiting manager review), `KpiAdminPage` (template list + cycle CRUD with transition buttons). TopBar nav: "KPI" (`kpi:assignment:read:self`) + "KPI Admin" (`kpi:cycle:write`).
- 9 new permission codes (M7): `kpi:cycle:{read,write}`, `kpi:template:{read,write}`, `kpi:assignment:{read:self,read:team,write:team}`, `kpi:review:{write:self,write:team}`. Catalogue grew from 75 to 84.

## [0.1.0-m6] - 2026-04-28

### Added
- **M6 — Payslip + Payroll CSV import:** `PayrollPeriod`, `PayrollComponent`, `PayslipRecord`, `PayrollRun` models. CSV import service with fail-soft per-row validation, gross/deductions/net balance check, and re-import support. PDF rendering via ReportLab (WeasyPrint guard kept for container environments). Publish service writes one `audit_log` row + one `payroll_audit_ledger` row per payslip — **first active writes to the chained ledger (M1b-4 milestone achieved)**. Re-publishing the same period is rejected. Hash chain verifies after publish.
- Endpoints: `GET/POST /api/v1/payroll/periods/`, `POST /api/v1/payroll/runs/` (multipart CSV upload), `POST /api/v1/payroll/runs/{id}/preview`, `POST /api/v1/payroll/runs/{id}/publish`, `GET /api/v1/payroll/runs/{id}/errors`, `GET /api/v1/payslips/me/`, `GET /api/v1/payslips/{id}/` (with presigned S3 PDF URL).
- Frontend: `MyPayslipsPage` (list + View PDF button), `PayrollAdminPage` (upload CSV, period selector, recent runs with Publish button). TopBar nav: "Payslips" (everyone with `payslip:read:self`) + "Payroll" (HR/finance with `payroll:run:create`).
- 6 new permission codes (M6): `payslip:read:self`, `payslip:read:org`, `payroll:run:create`, `payroll:run:publish`, `payroll:component:write`, `payroll:period:write`. Catalogue grew from 69 to 75.

## [0.1.0-m5] - 2026-04-28

### Added
- **M5a — Claims backend:** `ClaimCategory`/`ClaimPolicy`/`ClaimRequest`/`ClaimAttachment`/`ClaimApproval` models. Three pre-configured chains keyed by amount band (`CLAIM_UNDER_500`, `CLAIM_500_TO_5000`, `CLAIM_OVER_5000`). `ClaimRequestService` adapter wrapping M3a's `WorkflowEngine`. Signal handlers populate `claim_approvals` rows on workflow events (next-level row staged on multi-step approve). Endpoints `/api/v1/claims/{categories,policies,*}` + action verbs (`submit`, `approve`, `reject`, `cancel`, `mark-reimbursed`). Presigned-URL S3 attachment flow.
- **M5b — Claims frontend:** `ClaimSubmitPage` with multi-file presigned-URL upload before submit. `MyClaimsPage` (list + cancel). `FinanceQueuePage` for finance to mark reimbursed with bank reference. TopBar nav: "Claims" (everyone with `claim:create:self`) + "Finance" (finance role).
- 11 new permission codes (M5): `claim:*`. Catalogue grew from 58 to 69.

## [0.1.0-m4] - 2026-04-28

### Added
- **M4a — Schedule data layer:** `WorkSchedule`, `Shift`, `ShiftAssignment`, `Holiday` models. `ScheduleService` with `get_pattern_for_date`, `bulk_assign_pattern`, `publish_for_period`. `HolidayService` with `is_holiday`, `get_for_date`, `sync_from_country`. `seed_holidays_from_country` management command. Endpoints `/api/v1/schedule/{work-schedules,shifts,shift-assignments,holidays}` + `/shift-assignments/{bulk-pattern,publish,me}`.
- **M4b — Attendance:** `AttendanceRecord` (one per (employee, work_date)), `AttendanceService` with idempotent `clock_in`/`clock_out`/`today`. Holiday-replacement rule: when a `schedule_type='shift'` employee clocks in on a public holiday, the `attendance_clocked` signal fires and `BalanceService.grant_replacement` adds +1 day to their REPLACEMENT leave (idempotent on the attendance record reference). Endpoints `/api/v1/attendance/{clock-in,clock-out,today,records,team}`.
- **M4c — Frontend:** `MySchedulePage` (clock-in/out widget + weekly schedule grid), `RosterPage` (manager grid view + bulk-pattern + publish). TopBar nav: "Schedule" (everyone with `attendance:clock:self`) + "Roster" (managers).
- 15 new permission codes (M4): `schedule:*`, `attendance:*`. Catalogue grew from 43 to 58.

## [0.1.0-m3] - 2026-04-28

### Added
- **M3a — Workflow engine:** subject-agnostic state machine (`WorkflowEngine`) with `submit/act/cancel/withdraw` transitions and Django signals for `workflow_submitted/_step_approved/_step_rejected/_approved/_rejected/_cancelled/_withdrawn`. Resolvers for direct manager, department head, role, and finance. `ApprovalDelegation` model + `DelegationService`. Effective-approver routing (delegation > leave fallback > original).
- **M3b — Leave data layer:** `LeaveType`, `LeavePolicy`, `LeaveBalance`, `LeaveBalanceLedger` (append-only). `LedgerService` (idempotent on reference), `BalanceService` (accrue/hold/deduct/release/grant_replacement), `PolicyService` (tenure brackets). Seed command `seed_leave_types_from_country` for org-bootstrap from MY country defaults.
- **M3c — Leave requests + approval flow:** `LeaveRequest` + `LeaveApproval` models, `LEAVE_DEFAULT` chain (1-step DirectManager), `LeaveRequestService` adapter wrapping the workflow engine with balance integration, signal handlers that maintain `LeaveApproval` rows. Endpoints `/api/v1/leave/{types,balances,requests}` + action verbs `submit/approve/reject/cancel/withdraw`.
- **M3d — Frontend leave UI:** apply-for-leave form, "My Leave" page with balances + own requests + cancel/withdraw, manager Approvals Inbox with approve/reject (comment required for reject), TopBar nav links permission-gated.
- 14 new permission codes (M3): `leave:request:*`, `leave:balance:*`, `leave:type:write`, `leave:policy:write`, `leave:delegation:write:self`. Catalogue grew from 29 to 43 codes.

## [0.1.0-m2] - 2026-04-28

### Added
- **M2a — Employee Core:** Tier 2 `Employee` model with encrypted IC/bank/LHDN/EPF/SOCSO/EIS, manager self-FK with cycle protection, `OrgService` rewired to consult real Employees, `Department.head_employee_id` FK constraint on Postgres. CRUD viewset + `/api/v1/employees/me` self-edit (whitelist enforces phone/address/emergency-contact only; `role_title`/`employee_code` read-only on `/me`).
- **M2b — Finishers:** `/employees/{id}/{reporting-chain,direct-reports,probation-status}` endpoints. Audit-log integration via Django signals (employee.created/updated/archived with field-level diff). Bank-change requires fresh MFA via `X-MFA-Code` header + HR notification email. Frontend MyProfilePage at `/me/profile` displays employee profile.

### Changed
- Default role bundles extended with `employee:*` codes per spec §5.
- Permission catalogue grew from 18 (M1b) to 29 codes.

## [0.1.0-m1] - 2026-04-28

### Added
- **M1a — Foundations:** `BaseModel`, `TenantBaseModel`, `EncryptedCharField`, `Money` helpers, RFC 7807 exception handler, `Organization` model + Malaysia country/holidays/leave-type-defaults seed, `Department` tree.
- **M1b-1 — Identity:** Custom `User` model (org-scoped email uniqueness, MFA-ready fields, JSONB preferences/consents), Permission catalogue, Role bundles, UserRole, seed commands for the M1b permission scope and 7 default system roles (`org_admin`, `hr_manager`, `finance`, `manager`, `team_lead`, `employee`, `auditor`).
- **M1b-2 — Auth:** `/api/v1/auth/{login,refresh,logout,me,password/forgot,password/reset,mfa/enable,mfa/confirm,mfa,login/mfa}`. JWT (simplejwt) with refresh-token rotation. TOTP MFA via `pyotp`. Session table tracks issued tokens for server-side revocation.
- **M1b-3 — RBAC:** `HRMSPermission` DRF class, `TenantContextMiddleware`, `OrgService`, Redis-backed permission-set cache with signal invalidation. Organization + Department viewsets are now RBAC-gated.
- **M1b-4 — Audit:** `audit_log` (Tier-1) and `payroll_audit_ledger` (chained, append-only via Postgres trigger) tables. `AuditContextMiddleware` captures actor/ip/ua. Helper API: `from common.audit import append, append_payroll, verify_payroll_chain`. `/api/v1/org/settings` GET/PATCH endpoints.
- **M1c — Frontend Auth:** typed `openapi-fetch` API client with token storage and 401 refresh-retry; `AuthContext` + `useAuth` + `useCan`; login form with MFA challenge step; `<SignedOutGate>` + `<RouteGuard>`; AppShell with TopBar (logout); HomePage showing the signed-in user's email + permission codes.

## [0.1.0-m0] - 2026-04-27

### Added
- M0: Repo scaffold (Docker Compose, CI, pre-commit, OpenAPI contract codegen).
- Django 5 + DRF backend skeleton with split settings (base/dev/test/prod).
- Vite + React + TS + Tailwind frontend skeleton with biome + vitest.
- `packages/contracts` for generated OpenAPI → TypeScript types.
- `make {dev,test,migrate,contracts,lint,build}` targets.
- GitHub Actions CI: api, web, contracts drift, security.
- Pre-commit hooks: ruff, biome, detect-secrets, basic file hygiene.
