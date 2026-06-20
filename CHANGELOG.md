# Changelog

All notable changes documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.12.1] — 2026-06-20

Announcements management UI — the missing admin/HR surface for the dashboard's
featured/announcement cards (the v1.12.0 backend CRUD had no page).

### Added

- **Admin page** `/admin/settings/announcements` (gated on `announcement:write`,
  i.e. org_admin + hr_manager) under the Settings shell: list (DataTable) +
  create / edit / delete + a **Pin** toggle. The first pinned announcement is what
  surfaces as the hero "★ Featured" card. Form fields: title, body, category
  (policy/event/maintenance/holiday/general), pinned, optional expiry.
  `modules/admin/announcements-api.ts` wraps the generated client with RFC 7807
  error extraction.
- Settings sub-nav entry "Announcements"; the dashboard "Announcements" quick
  action now links here (was a `/admin/settings` placeholder).

### Tests

- Frontend: **343 passed** (+3 — list/create/permission-gate for the new page).
- Backend unchanged (771).

### Notes

- Frontend-only; no backend, migration, or permission changes (reuses the
  v1.12.0 `/api/v1/announcements/` CRUD + `announcement:write`).

## [1.12.0] — 2026-06-20

Dashboard **command-center redesign** — a ground-up rebuild of the dashboard into
an asymmetrical 5-layer workspace (hero · today's focus · operational bento ·
company & community · smart insights), on the existing dark design system with
glassmorphism + aurora hero. Specs:
`docs/superpowers/specs/2026-06-19-operational-dashboard-redesign-design.md` (backend
foundation) and `2026-06-20-dashboard-command-center-redesign.md` (final UI). Brief:
`References/UI_UX_fixed.md`.

### Added — backend subsystems

- New app `modules.announcements` — `Announcement` model + perm-gated CRUD at
  `/api/v1/announcements/`.
- New app `modules.onboarding` — `OnboardingChecklist` + `OnboardingItem` (6-item
  default template; auto-completes) + viewset at `/api/v1/onboarding/` with toggle.
- `PayrollException` model + viewset at `/api/v1/payroll/exceptions/` with `resolve`.
- `PayrollPeriod` 5-state workflow (`draft → approved → ready → processing →
  completed`) + stage timestamps; reversible data migration maps legacy
  `locked → approved`, `published → completed`.
- `Employee.resignation_date` (nullable) + `backfill_resignation_dates` command.
- **6 new permission codes** (`announcement:read/write`, `onboarding:read/write`,
  `payroll:exception:read/write`; 111 → 117), backfilled via `grant_default_perms`.

### Added — dashboard cards

- `hero_summary`, `pending_tasks` (action engine), `employee_snapshot`
  (+ monthly_growth), `payroll_status`, `activity_feed` (filters passive view-audit
  noise + resolves actor/department), `company_announcements` (+ body snippet +
  `featured`), and `smart_insights` (derived: payroll countdown, missing docs,
  contracts/certs expiring, probation — no AI, no new models). Cards self-hide via
  `requires_perms`.
- `seed_dashboard_demo` — idempotent demo data (announcements, active payroll period,
  exception, onboarding) so the dashboard reads as populated.

### Added — frontend (command center)

- 5 layer components under `modules/dashboard/components/command/`: `HeroWorkspace`
  (greeting + one-line summary + featured announcement + payroll countdown, aurora/
  glass), `TodaysFocus` (action cards), `OperationalWorkspace` (asymmetrical bento:
  large `EmployeeOverview` donut + growth, `PayrollProgress` stepper, tall
  `ActivityTimeline`, `QuickActions`), `CommunityLayer` (rich announcements +
  holidays + birthdays), `SmartInsights`.
- `glass-surface` / `hero-aurora` / `soft-glow` / `layer-eyebrow` utilities added to
  `index.css` (tokens only — no raw hex in components).

### Changed / Removed

- `DashboardPage` rebuilt around the 5 layers; the prior grid widgets
  (`components/widgets/`) removed. `role_filter` switched to the command-center card
  set — the standalone attendance/department/cert/KPI cards are folded into
  `pending_tasks` + `smart_insights`.
- Payroll publish now lands the period at `completed` (was `published`) +
  `completed_at`.

### Tests

- Backend: **771 passed** (1 pre-existing date-sensitive failure carried forward —
  `test_clock_out_completes_record`, CLAUDE.md §2.3).
- Frontend: **340 passed**.
- Permission codes: **117** (+6).

### Notes

- No new migrations beyond A1 (PayrollPeriod / PayrollException / resignation_date /
  the two new apps); no new feature flags (announcements/onboarding gated by perms;
  payroll-exceptions under the existing `payslip` flag).
- Browser visual walk deferred — the sandboxed env has no browser/sudo. Verify at
  `http://localhost:5173/` (run `seed_dashboard_demo` once for populated data). A
  design proof lives at `dashboard-preview.html` (untracked scratch).

## [1.11.0] — 2026-06-08

Unified user/employee creation. Makes onboarding a single coherent flow in
both directions, lets HR save an employee with only the essentials and
complete the rest later, and fills the previously-missing "create user"
admin UI. The nullable `User`↔`Employee` OneToOne is unchanged — user-only
(auditor / service account) and employee-only (record without login) both
remain valid. Spec + plan: `References/Prompt_v1.11.0_unified_user_employee_creation.md`,
`docs/superpowers/plans/2026-06-08-v1.11.0-unified-user-employee-creation.md`.

### Added

- **Progressive employee creation.** The employee create form now requires
  only 7 fields — `employee_code`, `first_name`, `last_name`, `email`,
  `hire_date`, `department`, `employment_type` — with required fields marked
  `*` and the rest in collapsible "Complete later" sections. Backend made
  the non-essential fields nullable (additive migration
  `employee.0004_alter_employee_address_line1_and_more`; the DRF serializer
  auto-relaxes `required` from the model).
- **Employee-first login provisioning.** An optional "Provision login
  account" section on `/employees/new` (role + credential method) creates +
  links a `User` atomically in the same submit. Existing-email is rejected
  with a "link instead" hint.
- **User-first creation page.** New `/admin/settings/users/new` (there was
  no user-creation UI before) with an optional "Also create an employee
  record" toggle revealing the 7 minimal fields. Linked from the
  Users linking page. Backend `POST /api/v1/users/` (`UserCreateView`).
- **Shared `provision_user` service** (`modules/identity/services/provisioning.py`)
  used by both paths: creates the user, assigns one role, writes a
  `user.created` audit row, busts the perm cache, and either sends an email
  invite (reusing the v1.2.0 reset flow — user with an unusable password
  sets their own) or sets a temp password with `must_change_password=True`.
- **Forced password change.** `User.must_change_password` flag (additive
  migration `identity.0005_user_must_change_password`), surfaced in the
  login + `/me` responses, enforced by a frontend gate
  (`SignedOutGate`) that routes such users to a new
  `/force-password-change` interstitial until they set a new password via
  the authenticated `POST /api/v1/auth/password/change`.
- **Profile-completeness indicator.** `profile_completeness`
  (`{percent, missing[]}`) computed field on the employee serializer and a
  non-blocking banner on the employee detail page linking to the edit form.
- **Permission `user:create`** — granted to `org_admin` and `hr_manager`.
  Permission codes **110 → 111**. Backfill existing orgs with
  `python manage.py grant_default_perms` (idempotent; busts the perm cache).

### Changed

- Employee create payload accepts an optional `provision` block; malformed
  or non-object `provision` returns RFC 7807 **400**, never 500.
- `EmployeeWritePayload` (web) now types the now-optional fields as optional.
- OpenAPI contract + generated TS regenerated.

### Known limitations

- `must_change_password` is a **client-side UX gate, not a backend security
  boundary**: a temp-password user holds a valid JWT and could call APIs
  directly before rotating. Acceptable for the intended flow (a temp
  password handed to the legitimate new hire who immediately changes it). A
  server-side middleware that 403s non-`/auth/password/change` requests
  while the flag is set is a possible future hardening.
- The auth views remain un-`@extend_schema`'d, so `must_change_password`
  and the new endpoints' request/response bodies are not in the typed
  contract — the SPA reads them via casts (pre-existing pattern).

### Tests

- Backend: **739 passed** (+38 vs v1.10.1). Pre-existing, unrelated failure
  carried forward: `modules/attendance/tests/test_clock_flow.py::test_clock_out_completes_record`
  (date-sensitive; fails identically on `master`, branch touches no
  attendance code — to be fixed separately).
- Frontend: **298 passed** (+20 vs v1.10.1).
- Permission codes: **111**.

## [1.10.1] — 2026-05-15

Closes the seven findings from the v1.10.0 Playwright sweep
(`.playwright-mcp/sweep-v1.10.0/REPORT.md`). Spec + plan are bundled in
`References/Prompt_v1.10.1_fix_sweep_bugs.md`. Bundle ordering: one
focused commit per bug-class, then a release commit. No new permission
codes, no fixture changes, no migrations.

### Fixed

- **Bug #1 (BLOCKER):** Claim attachment upload failed because presigned
  URLs embedded the Docker-internal `http://minio:9000/` hostname. Split
  the S3 client into `common.storage.s3.internal_s3_client` (server-side
  ops via `S3_ENDPOINT_URL`) and `public_s3_client` (browser-facing
  signed URLs via `S3_PUBLIC_ENDPOINT_URL`, falling back to the internal
  URL when unset for prod parity). Rewired claim attachments, employee
  avatars, payslip PDF download, KPI evidence, certification + training
  presigned uploads, and reports presigned-get. Payslip publish + reports
  export keep the internal client (`put_object`).
- **Bug #2 (CRITICAL):** Three-layer self-approval guard for the
  workflow engine. (a) Resolvers now exclude the requester from the
  candidate pool. (b) `WorkflowEngine.act()` raises `NotAuthorizedToAct`
  whenever `actor.id == subject.employee.user_id`, regardless of what
  the resolver picked. (c) `NotAuthorizedToAct` maps to HTTP 403 in the
  global exception handler (was 500). Same handler now also maps
  `InvalidTransition` / `NoApproverFound` to 400 with an RFC 7807 body.
- **Bug #3:** Approval emails fire on the hourly digest beat
  (`send_pending_email_digests`), so the sweep's "MailHog stayed at 0"
  was a false positive — the wiring at `modules/leave/signals.py:69`
  was correct all along. Made the cadence env-configurable via
  `EMAIL_DIGEST_INTERVAL_SECONDS` (default 3600, prod unchanged); dev
  defaults to 60 s so approval emails land within a QA loop. Existing
  regression test at `modules/leave/tests/test_workflow_integration.py:150`.
- **Bug #4:** `/leave/apply` toast now renders the backend's
  `errors[0].message` (RFC 7807) instead of `POST /api/v1/leave/...
  failed`. Added a tiny `_errorMessage` helper to
  `apps/web/src/modules/leave/api.ts` covering `errors[0].message →
  detail → title → fallback URL`. Verified end-to-end with the
  paternity 30-day-notice validator.
- **Bugs #5 + #6:** §3.9 date-drift regressions on
  `apps/web/src/modules/schedule/pages/MySchedulePage.tsx` and
  `RosterPage.tsx`. Both called `.toISOString().slice(0,10)` on local-
  time `Date` objects, which slips by a day between 00:00 and 08:00 KL.
  New helper module `apps/web/src/modules/schedule/lib/local-date.ts`
  exposes `isoLocalDate`, `todayIsoLocal`, `startOfWeekIsoLocal`, and
  `addDaysIso`. All four call sites switched over. The `RosterGrid`
  header keeps its UTC-anchored pattern (already correct per §3.9).
- **Bug #7:** `/claims/finance` had no frontend perm gate. Non-finance
  roles navigated in and saw an opaque "GET /api/v1/claims/?scope=
  finance-queue failed" alert. `FinanceQueuePage` now reads
  `useAuth().perms`, short-circuits when `claim:approve:finance` is
  missing, and renders a "Finance access required" empty state — no
  network call is made.

### Test counts

- Backend: **701 passed** + 3 skipped (postgres-only triggers). +6
  resolver/engine/storage tests on top of v1.10.0's 689.
- Frontend: **278 passed**. +8 (4 local-date helpers, 2 LeaveApplyPage
  error-toast assertions, 2 FinanceQueuePage route-guard assertions).
- Permission codes: **110** (no change).

### Notes / deferred

- The MinIO endpoint split adds `S3_PUBLIC_ENDPOINT_URL` to the api/
  worker/beat container env via `deploy/docker-compose.yml` (default
  `http://localhost:9000`). Prod deployments where the API and the
  browser share a hostname can leave the var unset.
- The email digest cadence (`EMAIL_DIGEST_INTERVAL_SECONDS`) default
  is unchanged for prod; only the dev compose value drops to 60 s.
- Carried forward from v1.10.0: §4 single-liners (LeaveApplyPage /
  ClaimSubmitPage `PageHeader` wraps, EmployeeDetailPage hire_date,
  MyLeavePage date columns) and L5 (biome config inconsistency).

## [1.10.0] — 2026-05-14

UI quality sweep — closes the seven `FAIL` pages from
`docs/audits/2026-04-29-ui-quality.md` in a single batched release.
Mechanical work: same canonical template (`PageHeader` + human-formatted
dates + `StatusPill`) applied to each page. Zero backend changes, no new
permission codes, no new endpoints. Plan in
`docs/superpowers/plans/2026-05-14-v1.10.0-ui-quality-sweep.md`.

### Changed

- **MyCertificationsPage** (`/certifications/me`). Added `PageHeader`
  with "Add Certification" action slot. `issued_on` / `expires_on` now
  render as "15 Mar 2026" via `toLocaleDateString`. Cert status moved
  from `capitalize` text to `<StatusPill>` (active→mint, expired/revoked
  →coral). Expiry-window color flag retained on the date cell. Outer
  container bumped to `max-w-5xl mx-auto` for consistency.

- **MyTrainingPage** (`/training/me`). `PageHeader` replaces bare h1.
  Inline `statusBadge` helper deleted; status now `<StatusPill>`
  (assigned→yellow, in_progress→sky, completed→mint, overdue→coral).
  `due_date` formatted human-readable.

- **AdminCertPage** (`/certifications/admin`). `PageHeader` replaces
  bare h1. Employee UUID column truncates to `xxxxxxxx…` with full UUID
  available on hover (`title=` attribute) — no employee-name lookup
  endpoint exists yet; truncation matches the elsewhere-used pattern.
  `expires_on` formatted human-readable. Status → `<StatusPill>`. Table
  rows wrapped in card surface.

- **MySchedulePage** (`/schedule/me`). `PageHeader` replaces bare h1 in
  both happy-path and `NotLinkedEmptyState` branches. Today heading now
  reads `Today — 14 May 2026` (was `Today — 2026-05-14`). Week heading
  shows the full range (`Week of 12 May 2026 – 18 May 2026`). Attendance
  status moved into a `<StatusPill>` with attendance-tone mapping
  (present/clocked_in/on_duty→mint, late→yellow, absent→coral, no
  record→peach). Day-of-week table headers show numeric day (`Mon 12`)
  instead of mm-dd (`Mon 05-12`).

- **KpiAdminPage** (`/kpi/admin`). `PageHeader` replaces bare h1; the
  "+ New Cycle" toggle moves into the header `actions` slot.
  `KpiCycleStatus` → `<StatusPill>` (upcoming→yellow, self_review→sky,
  manager_review→lavender, closed→mint). Cycle type column gets a
  proper label map (`semi_annual` → "Semi-annual") instead of an
  underscore-replace string. Existing `KpiAdminPage.test.tsx` still
  asserts the heading via `getByRole("heading", { name: /kpi admin/i })`
  — title text unchanged, so no test churn.

- **MyClaimsPage** (`/claims/me`). `PageHeader` replaces bare h1;
  "Submit a claim" link moves into the header `actions` slot. Local
  `StatusBadge` component deleted; status now `<StatusPill>` with a
  per-`ClaimStatus` tone map (draft→yellow, submitted→sky,
  manager/finance_approved→lavender, reimbursed→mint, rejected→coral,
  cancelled→peach). `expense_date` formatted human-readable.

- **MyPayslipsPage** (`/payslips/me`). `PageHeader` replaces bare h1.
  `published_at` formatted human-readable. New `<StatusPill>` next to
  the date subtitle for `PayslipRecord.status` (draft→yellow,
  published/sent→mint). List items moved onto `bg-surface-hover` card
  surface for visual consistency with the rest of the sweep.

### Deferred

- **L5 biome config inconsistency** — still its own focused PR, as
  documented in v1.9.2.

- **Other minor cosmetic items** flagged in the audit's §4 ("Minor
  fixes that are single-line changes"): `LeaveApplyPage` and
  `ClaimSubmitPage` `PageHeader` wrap, `EmployeeDetailPage` hire_date
  formatting, `MyLeavePage` date columns. One-liners; bundle into a
  later patch release.

### Test counts at HEAD

- Backend: **689 passed** + 3 skipped (unchanged from v1.9.2).
- Frontend: **270 passed** (unchanged — no new tests added or removed;
  the rewrites are template substitutions that keep the existing
  assertions passing).
- Permission codes: **110** (unchanged).

## [1.9.2] — 2026-05-14

Second polish pass against the post-v1.9.0 audit
(`docs/audits/2026-05-14-v1.9.0-code-analysis.md`). Closes the
remaining mediums and most low/info items. M3 deferred by request
(only matters in Phase 2 multi-tenant SaaS). L5 deferred — turned out
to be a project-wide biome config inconsistency rather than a v1.9.0
files issue; will be its own focused PR.

### Changed

- **(M1) Bulk-query auto-suggest in link manager.**
  `apps/api/modules/employee/views_link_manager.py` —
  `UnlinkedUsersView.get_serializer_context()` and
  `UnlinkedEmployeesView.get_serializer_context()` now precompute a
  `{lower_email -> row}` dict once per request and inject via serializer
  context. The per-row `email__iexact` lookup is replaced by a dict
  `.get(...)`. One extra SELECT instead of N. Legacy single-query path
  preserved as a fallback for callers that build the serializer outside
  a view (unit tests, scripts).

- **(M2) Settings Overview cached for 60s per org.**
  `apps/api/modules/identity/views_admin_overview.py` — Django's default
  cache backend now backs `/admin/settings-overview/` with a 60s TTL,
  keyed `settings_overview:v1:{org_id}`. Reduces ~8 SQL count queries
  per request to a single cache hit on warm paths.

- **(L7) Settings Overview reads write an audit log row.**
  `admin.overview_viewed` action, kept outside the cached path so every
  view is captured (not just cache misses).

- **(L1) Magic-byte image validation in `process_org_logo`.**
  `apps/api/modules/organization/tasks.py` — sniffs the leading bytes
  before calling `Image.open()` to fail fast on non-image content with
  a clear log line instead of a Pillow exception. Recognizes PNG, JPEG,
  and WebP (RIFF container). Non-image content is cleaned up from S3
  and the task returns `""`.

- **(info) `<UsersLinkingPage>` dropdowns use the Popover primitive.**
  Replaces the hand-rolled `<div>`-based open/close state with the
  project's Radix-based `Popover` (mirrors the v1.6.2 ManagerPicker
  fix). Outside-click close, Escape-to-close, focus trap, and proper
  aria attributes come for free.

- **(info) `<OrganizationSettingsPage>` Cancel resets from local state.**
  No longer triggers a server refetch — eliminates the brief loading
  flash. Refresh on save still works as before.

### Test counts at HEAD

- Backend: **689 passed** + 3 skipped (postgres-only). +3 from v1.9.1
  (audit-log write test + cache-stability test + magic-byte rejection
  test).
- Frontend: **270 passed** (unchanged).
- Permission codes: **110** (unchanged).

### Deferred (intentional)

- **M3** — `Permission.objects.count()` global vs. per-org. Currently
  correct on single-tenant Provintell; relabel or rescope when Phase 2
  SaaS lands.
- **L5** — biome format drift on v1.9.0 frontend files. Root cause is
  project-wide: `biome.json` declares `formatter.indentStyle: "space" /
  semicolons: "asNeeded"` but the rest of the codebase uses tabs +
  always-semicolons. Running biome `--write` here would diverge from
  every other file in the repo. Needs its own PR that either updates
  `biome.json` to match the de-facto style (lower risk) or
  reformats the entire codebase (high churn).
- **info** — drag-to-reparent in DepartmentsAdminPage (v1.10.0 feature
  scope) · NEW pill auto-clear (just delete in v1.10.0).

### Not pushed

- Local-only tag `v1.9.2`. Run `git push origin master --tags` after
  user approval.

## [1.9.1] — 2026-05-14

Patch release closing the medium-and-low items from the post-v1.9.0
`/sc:analyze` audit (`docs/audits/2026-05-14-v1.9.0-code-analysis.md`).
No new features, no schema changes, no perm changes.

### Changed

- **`settings-api.ts` retyped to use the typed openapi-fetch `api` client**
  (audit M4 + L4). v1.9.0 shipped with a raw-fetch wrapper because the
  new endpoints weren't yet in the generated OpenAPI schema. The v1.9.0
  contracts regen (`e78c0b7`) added them, so the wrapper now goes through
  `@/lib/api` and inherits the 401-refresh middleware transparently.
  Drops the duplicated `BASE` constant. S3 PUT inside `LogoUploader`
  stays as raw `fetch` because the presigned cross-origin URL must not
  carry the bearer header.

- **`SettingsNav.useEffect` gates the overview fetch on `useCan("role:read")`**
  (audit M5). v1.9.0 fired `/admin/settings-overview/` for every user
  landing on Settings, including manager-tier users who'd get a 403.
  Now non-`role:read` users never hit the endpoint.

- **`DepartmentsAdminPage` swaps `window.confirm` for the project's `Dialog`
  primitive** (audit L2). Consistent with the v1.4.0 `AdminTeamsPage`
  archive flow.

- **`process_org_logo` uses `Organization.save(update_fields=...)` instead
  of `Organization.objects.filter().update()`** (audit L3). `.update()`
  bypasses Django signals — currently a no-op (Organization has no
  signals), but a maintenance hazard if any are added later.

- **`NotLinkedEmptyState` drops the unreachable `??` fallback**
  (audit L6). TS already narrows `scope` to `keyof typeof COPY`.

### Test counts at HEAD

- Backend: **686 passed** + 3 skipped (postgres-only). +22 from v1.9.0
  (most of the delta is fixture-side: existing tests are re-counted
  when test discovery picks up the v1.9.0 test modules in different
  bins; new behavioral coverage in v1.9.1 is 0 tests — refactors only).
- Frontend: **270 passed** (unchanged from v1.9.0).
- Permission codes: **110** (unchanged).

### Not pushed

- Local-only tag `v1.9.1`. Run `git push origin master --tags` after
  user approval.

## [1.9.0] — 2026-05-14

### Added
- **Settings hub** at `/admin/settings` — a 2-pane shell with a 220px sub-nav on the left and the active sub-page on the right. Sub-nav items: Overview · Organization · Modules · Departments · Teams · Users & Linking · Archived · Roles & Perms · Leave Types. Filtered per-perm.
- **Overview landing** — attention banner when there are unlinked users, 4 stat tiles (employees · departments · modules · roles), and a feed of the last 5 admin audit-log entries. Single endpoint `GET /api/v1/admin/settings-overview/` (gated on `role:read`).
- **Organization settings page** at `/admin/settings/organization` — custom company logo upload (presign → MinIO PUT → register → Celery resize to 256-max-dim WebP) and identity fields (name / currency / timezone / locale). Reuses the v1.7.0 avatar pipeline shape but preserves aspect ratio (logos must not be square-cropped).
- **Departments admin UI** at `/admin/settings/departments` — indented tree-view CRUD over the existing FK model. New / Edit / Delete with `DELETE` returning 400 + "reassign before deleting" when active employees still reference the department.
- **Users & Linking page** at `/admin/settings/users` — side-by-side unlinked-users and unlinked-employees lists with case-insensitive email auto-suggest pinned to the top of the Link dropdown. New endpoints: `GET /admin/unlinked-users/`, `GET /admin/unlinked-employees/`, `POST /employees/{id}/link-user/`, `DELETE /employees/{id}/link-user/` (all gated on `employee:write:org`).
- **Archived Employees page** at `/admin/settings/archived` with one-click restore. New endpoint `POST /employees/{id}/restore/` (gated on `employee:archive`, idempotent). Existing `GET /employees/` now accepts `?status=active|archived|all` (default `active`, unchanged).
- **`<OrgLogo>`** sidebar header component — replaces hardcoded text. Reads `/org/settings`, renders the uploaded logo when present, falls back to gradient square + uppercase org-name.
- **`<NotLinkedEmptyState>`** card on `/me/profile`, `/schedule/me`, `/leave/me`, `/claims/me` — replaces the inline "isn't linked" message with a shared composite. `scope` prop parameterizes per-page copy.
- New `Organization.logo_s3_key` column (additive migration 0005).
- New `process_org_logo` Celery task (mirrors `process_avatar_upload`, uses `Image.thumbnail` to preserve aspect).
- 9 new audit-log actions: `employee.restored`, `employee.user_linked`, `employee.user_unlinked`, `department.created/updated/deleted` (via existing DepartmentViewSet writes), `org.logo_updated`, `org.logo_removed`, `org.settings_updated`.

### Changed
- **Main sidebar's Admin group** collapses 4 items (Roles · Teams · Modules · Leave Types) into a single **Settings** entry. `/admin/{roles,modules,teams,leave-types}` legacy routes redirect to `/admin/settings/*` via `<Navigate replace />` so deep links keep working.
- **CommandPalette** gets `Settings · …` entries for each sub-page so palette nav still routes deep.
- `GET /api/v1/org/settings` now returns a `logo_url` field (1h-presigned GET URL of the resized logo, or `null`).
- `PATCH /api/v1/org/settings` now writes an `org.settings_updated` audit log capturing which fields changed.
- `DELETE /api/v1/departments/{id}/` now returns 400 with a "reassign before deleting" message when active employees still reference the department. Soft-deleted employees don't block.

### Test counts at HEAD
- Backend: **664 passed** + 3 skipped (postgres-only triggers). +21 from v1.8.0 across `test_logo_endpoints.py` (9), `test_logo_task.py` (3), `test_archived_and_restore.py` (7), `test_link_manager.py` (14), `test_settings_overview.py` (3), `test_department_delete_guard.py` (3), `test_org_settings.py` (+3), `test_models.py` (+1).
- Frontend: **270 passed**. +27 from v1.8.0 across SettingsShell (4), SettingsOverviewPage (4), OrganizationSettingsPage (4), DepartmentsAdminPage (4), UsersLinkingPage (3), ArchivedEmployeesPage (2), OrgLogo (3), NotLinkedEmptyState (3).
- Permission codes: **110** (unchanged — `org:settings:write` already existed in fixtures pre-v1.9.0).

### Not pushed
- Local-only tag `v1.9.0`. Run `git push origin master --tags` after user approval.

## [Unreleased]

### Fixed (config + docs — no behaviour change)
- **`HRMS_FIELD_ENCRYPTION_KEY` consolidation.** Closes the deploy
  blocker flagged in `2026-04-29-system-state.md` Bug #3 and
  `2026-05-06-system-state-analysis.md` action #1.
  - `.env` was documented as `usD5…` but containers actually ran with
    `5rrM…` (the silent docker-compose fallback). Verified existing
    encrypted PII (e.g., PVT-DEMO-005 IC `910214…5475`) decrypts under
    `5rrM…`, so that key is the canonical dev key.
  - Aligned `.env`, `References/KEY.md` to `5rrM…`, with explicit
    "DEV key — do NOT use in production" guidance and a Fernet
    generation snippet.
  - Tightened `deploy/docker-compose.yml` — `:?` guard replaces the
    silent fallback. Compose now fails fast if `HRMS_FIELD_ENCRYPTION_KEY`
    is unset, preventing future silent drift.
  - `start.sh` and `Makefile` now pass `--env-file .env` explicitly so
    compose picks up the repo-root `.env` regardless of cwd (compose v2
    looks next to the compose file by default, which is `deploy/`).
  - Improved `.env.example` with Fernet generation instructions and
    a "lose this key = unrecoverable PII" warning.
- Verified post-change: api/worker/beat recreated cleanly,
  `/health/ready` 200, encrypted-field decrypt still works.

### Known runbook gaps (tracked, not fixed in this change)
- `docs/runbooks/rotate-encryption-keys.md` describes a 2-key window
  using `HRMS_FIELD_ENCRYPTION_PREV_KEY` and a
  `reencrypt_sensitive_fields` management command. Neither exists in
  the codebase yet. The runbook is forward-looking documentation; if
  rotation is ever needed, both pieces must be implemented first.
  Tracked for whichever release schedules a key rotation.

## [1.8.0] - 2026-05-08

**Leave module enhancement — admin-configurable tenure-tier entitlement,
carry-forward expiry, per-employee override, and Celery year-rollover jobs.
Seeds Malaysian Employment Act 1955 (post-2022) statutory minimums.**

### Added

- Admin page `/admin/leave-types` with master-detail layout and three tabs:
  - **General** — code, name, accrual type, paid/statutory/attachment flags,
    gender restriction, plus a Statutory Eligibility group
    (`requires_service_months`, `notice_days_required`, `max_per_lifetime_events`).
  - **Tenure tiers** — composes a reusable `<TenureBracketEditor>` per
    `LeavePolicy` (add/remove rows of `{min_years, days}`).
  - **Carry-forward** — 4-mode radio (no carry / capped no expiry /
    capped + expiry / unlimited) → backend payload mapping, with the
    statute-max hint at 12 months.
- `EmployeeLeaveOverride` model + per-employee override editor on
  `/employees/:id/edit` (HR-only, gated by `leave:balance:adjust:org`).
  Override history preserved by soft-delete + optional `effective_to`.
- `compute_entitlement` resolver: override > LeavePolicy.tenure_brackets >
  LeaveType.default_days (reuses M3 PolicyService for tenure-bracket math).
- `prorate_for_hire_date`: §60E by-month proration for new joiners
  (months_remaining / 12 of entitlement, rounded to nearest 0.5).
- Three idempotent Celery jobs keyed on UUID5(employee, leave_type, year):
  - `year_rollover` (Jan 1 01:00 KL): per-org `run_year_end_carry_forward`
    then `run_year_start_accrual`.
  - `carry_forward_expiry_sweep` (daily 02:30 KL): debits unused carried
    days at their expiry date (FIFO model — carried days consumed first).
- `/api/v1/leave/policies/` CRUD with bracket-shape validation
  (ascending `min_years`, non-decreasing `days`).
- `/api/v1/leave/employee-overrides/` nested viewset (HR write, self/HR read).
- `/api/v1/admin/leave/accrue/`, `.../carry-forward/`, `.../expire-carry/`
  manual trigger endpoints (HR-only, supports `dry_run`).
- `/api/v1/leave/balances/me/` payload now includes
  `carried_forward_expires_at` and `ledger_recent` (last 10 entries).
- `MyLeavePage` entitlement breakdown grid: one card per leave type with
  Granted / Used / Pending / Carried / Available stats, expiry pill
  (orange within 30 days, violet otherwise), and an expandable
  "Show recent activity" panel.
- Statutory eligibility validators in `LeaveRequestService.submit`:
  - `requires_service_months` (paternity §60FA: 12 months)
  - `notice_days_required` (paternity §60FA: 30 days)
  - `max_per_lifetime_events` (maternity §37 / paternity §60FA: 5
    confinements; approximated as past approved request count since HRMS
    doesn't track child-status data).
- Schema additions (all additive migrations):
  - `LeaveType` columns: `carry_forward_expiry_months`,
    `requires_service_months`, `notice_days_required`,
    `max_per_lifetime_events`.
  - `LeaveBalance.carried_forward_expires_at` (date, nullable).
  - `EmployeeLeaveOverride` table.
  - `CountryLeaveTypeDefault.tenure_brackets` (JSON).
- MY country fixture upgraded:
  - ANNUAL: 8 / 12 / 16 by tenure (§60E).
  - MEDICAL: 14 / 18 / 22 by tenure (§60F outpatient).
  - **HOSPITALIZATION: new leave type, 60 days flat** (post-2022 §60F
    amendment that separates hospitalization from outpatient sick leave).
  - Maternity 98 / paternity 7 unchanged.

### Changed

- `LeaveTypeViewSet` widened from `ReadOnlyModelViewSet` to
  `ModelViewSet`; write actions gated by existing `leave:type:write`.
- `seed_leave_types_from_country` now also creates a default org-wide
  `LeavePolicy` with the country fixture's `tenure_brackets`, plus
  applies statute-level field defaults per leave-type code (paternity
  service prerequisite + notice + lifetime cap, maternity lifetime cap,
  ANNUAL carry-forward expiry hint = 12 months).
- Maternity / paternity LeaveType seeds now carry the appropriate
  `gender_restriction`.

### Permissions

- **No new permission codes.** All gating uses existing M3 codes
  (`leave:type:write`, `leave:policy:write`, `leave:balance:adjust:org`).
  Permission count stays at 110.

### Test counts

- Backend: **643 passed** + 3 skipped (postgres-only triggers).
  Was 593 at v1.7.1 — +50 across compute_entitlement (5), prorate (7),
  year-start job (3), carry-forward job (4), expiry job (3), replacement
  regression (1), validators (4), seed (3), endpoints v1.8 (12), models
  v1.8 (8 across LeaveType / EmployeeLeaveOverride / LeaveBalance).
- Frontend: **243 passed**. Was 227 at v1.7.1 — +16 across
  TenureBracketEditor (4), LeaveTypeCarryForwardTab (4),
  AdminLeaveTypesPage (2), LeaveOverrideEditor (2), EntitlementCard (4).

### Known approximations / risks

- "5 surviving children" cap (§37 / §60FA) is approximated as
  "5 confinements" (count of past approved leave requests of this type).
  HRMS does not track child status; HR can override via
  `manual_adjustment` ledger entry.
- Carry-forward uses a FIFO model: when computing the unused-carry
  remainder at expiry, carried days are deemed consumed before entitled
  days. (Otherwise 100% of carries would always expire, which would
  defeat the carry-forward feature.)
- Mid-year edits to `tenure_brackets` apply at the next year-start grant,
  not retroactively. Existing balances stay as granted.
- REPLACEMENT auto-credit (existing M3 + M4 path) fires on attendance
  `clock_in` for shift workers on holiday work. If the attendance is
  later disputed and cancelled, the credit is not auto-rescinded — HR
  must do that manually via the `manual_adjustment` ledger reason.
  Tracked as a v1.8.x follow-up.
- Year-start job iterates the org's employees in one Celery task. Fine
  for Provintell (~50 staff); a Phase 2 SaaS deployment will need
  chunking.

### Out of scope (deferred)

- Anniversary-based leave year (Q5 alternative; calendar year stays).
- Pro-rata by working day (Q4 alternative; by-month stays).
- Emergency-paternity escape hatch for the 30-day notice rule.
- Sabah/Sarawak state-specific leave variants (Peninsular MY only).
- Phase 2 SaaS multi-tenant year-start chunking.

### Migration

- `python manage.py migrate` to pick up the four additive migrations
  (leave 0003/0004/0005, organization 0004).
- `python manage.py seed_country_reference_data --country MY` to refresh
  MY fixture (ANNUAL 8/12/16, MEDICAL 14/18/22, new HOSPITALIZATION).
- `python manage.py seed_leave_types_from_country --org-id <uuid>` per
  org to apply tenure_brackets to LeavePolicy + statute fields to
  LeaveType.
- For existing balances, run the manual `POST /api/v1/admin/leave/accrue/`
  (or wait for the Jan 1 01:00 beat) to issue v1.8.0-aware entitlements.

## [1.7.1] - 2026-05-07

**v1.7.0 follow-up — unblock self-edit for manager/finance/team_lead/auditor.**

### Fixed
- **`employee:write:self` granted to `manager`, `finance`, `team_lead`,
  and `auditor` roles** in `default_roles.yaml`. v1.7.0's Playwright
  sweep surfaced that PATCH `/api/v1/employees/me/` 403'd for these
  roles — they had `employee:read:self` but never received the
  matching write perm. The new inline-section editing UI on
  `/me/profile` is now usable for everyone with a linked Employee
  record, not just `org_admin` / `hr_manager` / `employee` role
  holders.
- Existing orgs pick up the grant via `grant_default_perms` (admin
  customisations preserved; same pattern as v1.5.0's leave-self fix).

### Tests
- 593 backend + 227 frontend (no test changes — pre-existing tests
  granted `employee:write:self` explicitly to test users; the gap
  only surfaced against real demo accounts).
- Permission codes: 110 (no change).

### Migration
- Run `python manage.py grant_default_perms` after deploy. No schema
  migrations.

## [1.7.0] - 2026-05-07

**Profile pictures + employee self-edit.**

### Added
- **Employee self-edit on `/me/profile`.** Each section's "Edit" button
  (no-op since v1.0.0) now toggles inline edit fields with Save/Cancel.
  Backed by the existing `PATCH /api/v1/employees/me/` endpoint and
  `SELF_EDIT_WHITELIST`. Bank-field saves trigger the shared
  `<MfaPrompt>` (extracted from v1.6.0's inline component).
- **Address section** on `/me/profile` (was missing despite address
  fields being in the allowlist).
- **Profile pictures for everyone.** New `<AvatarUpload>` component
  drives a 3-step presigned upload (presign → PUT to MinIO → register).
  Backend Celery task downscales to 512x512 WebP, strips EXIF, replaces
  the prior thumbnail. Photos render on `/me/profile`,
  `EmployeeDetailPage`, `EmployeeCard`, and the HR `EmployeeForm`
  Identity section.
- New `Employee.photo_s3_key` column (plain `CharField`, additive
  migration `0003_employee_photo`).
- Six new endpoints on `EmployeeViewSet` — three self
  (`/me/photo/presigned-upload`, `/me/photo` POST/DELETE) and three HR
  mirrors (`/employees/{id}/photo/...`).
- `photo_url` (read-only, presigned-GET 1-hour TTL) on
  `EmployeeSerializer` and `EmployeeMeSerializer` GET responses.

### Changed
- `<MfaPrompt>` extracted to `apps/web/src/components/hrms/MfaPrompt.tsx`
  for reuse across `EmployeeFormPage` (v1.6.0 bank replace) and
  `MyProfilePage` (v1.7.0 bank edit).
- `services.py` refactored into a `services/` package so
  `services/avatar.py` can live alongside `EmployeeService`.
- `Employee.objects` → `Employee.all_objects` in the Celery resize
  task (PK lookup; runs without request tenant context).

### Tests
- Backend: 593 passed + 3 skipped (was 581 + 3 at v1.6.2; +12 across
  `test_avatar_endpoints.py` (8), `test_avatar_task.py` (3), and one
  `photo_url` regression in `test_views_me.py`).
- Frontend: 227 passed (was 213 at v1.6.2; +14 across `MfaPrompt` (3),
  `AvatarUpload` (5), and `MyProfilePage` (+6)).
- Permission codes: 110 (no change — no new perm codes).

### Migration
- `apps/api/modules/employee/migrations/0003_employee_photo.py` —
  additive `AddField`. No data backfill needed.

### Out of scope (deferred)
- `CommandPalette` Employees results don't yet show small avatars.
- `UserMenu` does not currently render an avatar; not added in v1.7.0.
- `EmployeeForm` `<ManagerPicker>` not-disabled-for-non-write-org gap
  (filed in v1.6.2). Backend safety still holds.

## [1.6.2] - 2026-05-07

**ManagerPicker dropdown close fix.**

### Fixed
- **`<ManagerPicker>` dropdown now closes on selection.** v1.6.0 mounted
  cmdk's `<Command>` inline, producing an always-open list with no way
  to close. Clicking a candidate fired `onChange` but left the list
  expanded and showed no "selected" state on the form — only a row
  highlight inside the list. Rebuilt as a Popover-based combobox: the
  trigger is now a button showing the selected manager's name (or a
  placeholder); the cmdk Command lives inside a portaled
  `<PopoverContent>` and dismisses on select / Escape / outside-click.
- Prop contract unchanged (`value` / `excludeIds` / `options` /
  `onChange`); `EmployeeForm` consumer untouched.

### Tests
- Frontend: 213 passed (was 207 at v1.6.1; +6 in
  `ManagerPicker.test.tsx`: list hidden by default, trigger shows
  selected name, closes on select, closes on Escape, (No manager) →
  null, existing 3 adapted to click-trigger-first).
- Backend: 581 passed (no change).
- Permission codes: 110 (no change).

### Migration
- No schema migrations. No backend changes. Frontend-only.

### Known issues filed for v1.6.x
- `EmployeeForm.tsx` doesn't disable the `<ManagerPicker>` for users
  without `employee:write:org`. Ops.lead/team_lead can interact with
  the picker through the UI; the backend's narrow-PATCH lane still
  rejects any manager-field write at API level so the security model
  holds, but the UI should match the perm gate.

## [1.6.1] - 2026-05-07

**v1.6.0 follow-up — unblock team_lead/manager edit-page pre-fill.**

### Fixed
- **`GET /api/v1/employees/{id}/` now also accepts `employee:assign:team`**
  in addition to `employee:read:org`. The v1.6.0 narrow-PATCH lane worked
  at API level (4 endpoint tests passed; curl matrix matched), but the
  Playwright sweep surfaced that team_lead/manager's edit page rendered
  empty because the SPA's pre-fill GET 403'd. Spec §9.1 #4 expected
  ops.lead to open an employee's edit page and see all fields read-only
  except Team — that flow now works end-to-end.
- No PII regression: encrypted fields (`ic_number`, `bank_account_number`,
  `lhdn_tax_no`, `epf_no`, `socso_no`, `eis_no`) are write-only on
  `EmployeeSerializer`, so a non-HR retrieve never sees plaintext PII —
  only the `*_last4` masks already designed for that purpose.

### Tests
- Backend: 581 passed + 3 skipped (was 580 + 3 at v1.6.0; +1 in
  `test_assign_team.py::test_team_lead_can_retrieve_employee_for_form_prefill`).
- Frontend: 207 passed (no change).
- Permission codes: 110 (no change).

### Migration
- No schema migrations. No fixture changes. Code-only.

## [1.6.0] - 2026-05-07

**Employee CRUD UI + Team CRUD page + perm-narrow team-assignment.**

### Added
- **Employee CRUD UI.** `/employees/new` and `/employees/:id/edit` use
  a shared collapsible-section form (`<EmployeeForm>`) with five
  sections: Identity, Employment, Personal, Address, Banking & Tax IDs.
- **Encrypted PII edit flow.** `<EncryptedFieldInput>` shows a masked
  summary (`🔒 IC ending in •••5475` when a `_last4` companion exists,
  `🔒 Encrypted` otherwise for LHDN/EPF/SOCSO/EIS) with a Replace
  modal. Current value is never displayed. Bank-field replace on edit
  prompts for fresh MFA before save (header `X-MFA-Code`).
- **`<ManagerPicker>`.** cmdk-based typeahead with `excludeIds` for
  client-side cycle protection (backend `Employee.full_clean()`
  enforces canonically).
- **`/admin/teams`.** Full team CRUD: list with parent / sort_order /
  min_headcount / member-count, create + edit modal sharing one schema,
  archive with confirm.
- **New permission `employee:assign:team`.** Carves a narrow PATCH lane
  on `/api/v1/employees/{id}/`: holders may PATCH only `team` (or
  `team_id`); mixed-write or other-field PATCHes return 403. Granted by
  default to org_admin, hr_manager, manager, team_lead.
- **Sidebar + command palette Teams entry**, gated on `team:write`.
- **EmployeesPage** now wires the New employee button to navigate to
  `/employees/new` and gates correctly on `employee:create` (was
  checking the non-existent code `employee:write` — button never
  appeared).
- **EmployeeDetailPage** gains Edit (link, perm `employee:write:org`)
  and Archive (two-step armed button, perm `employee:archive`)
  actions.

### Changed
- **`team:write` is now a default grant for `hr_manager`** (was
  org_admin only) so HR can manage teams from the new UI without an
  admin override.
- **`EmployeeViewSet.partial_update`** now branches on perm + body
  shape: `employee:write:org` → full edit (existing behaviour);
  `employee:assign:team` + body within `{team, team_id}` → narrow
  edit via `EmployeeAssignmentSerializer`; otherwise 403.
- **`required_perms` for `partial_update`** returns `[]` so the inline
  branch logic owns the perm check; auth + tenant scope still enforced
  by `HRMSPermission`.

### Tests
- Backend: 580 passed + 3 skipped (was 569 + 3 at v1.5.1; +11 new across
  `test_assign_team.py` (4) and `test_assign_team_perm_seeded.py` (7)).
- Frontend: 207 passed (was 180 at v1.5.1; +27 across
  EncryptedFieldInput, ManagerPicker, EmployeeForm, EmployeeFormPage,
  AdminTeamsPage, plus extensions to EmployeeDetailPage, EmployeesPage,
  Sidebar).
- Permission codes: 110 (was 109; +1 = `employee:assign:team`).

### Migration
- No schema migrations.
- New permission code lands via `seed_permission_catalogue`. Existing
  orgs pick up the `employee:assign:team` and `team:write` grants on
  next `grant_default_perms` run; the v1.5.0 cache-bust means
  logged-in users see the change without re-login.

### Out of scope (deferred)
- Bulk operations (move N employees → 1 team in one click).
- CSV import/export, employee photo upload, approval workflows.
- No widening of the `/api/v1/employees/me` self-edit allowlist.

## [1.5.1] - 2026-05-06

**Module-disabled empty-state + cover-up picker.**

### Added
- **`<ModuleDisabled>` empty-state component**
  (`apps/web/src/components/hrms/ModuleDisabled.tsx`).
  Renders a calm per-module message when a user lands on a disabled-module
  page. Org admins (anyone with `org:feature_flag:write`) see an "Enable
  <Module> →" deep-link to `/admin/modules?focus=<key>`; everyone else
  gets the same passive copy without a CTA.

- **`<RequireFeature>` route-level guard + `withFeature(flag, routes)`
  helper** (`apps/web/src/lib/feature-flags.tsx`). Wraps each module's
  route array in `App.tsx` so direct URL navigation to a disabled-module
  page renders `<ModuleDisabled>` instead of the raw `GET /api/v1/X failed`
  text. Optimistic during initial flag load — never flashes "disabled"
  while flags are fetching.

- **`/admin/modules?focus=<key>` deep-link**
  (`apps/web/src/modules/admin/pages/AdminModulesPage.tsx`).
  Reading the `?focus=` param scrolls the matching toggle row into view
  and highlights it for 2 seconds. Used by the Enable CTA.

- **`<CoverUpPicker>` inline component**
  (`apps/web/src/modules/schedule/components/CoverUpPicker.tsx`).
  Teammate dropdown (same-team first, alphabetical), Save / Cancel /
  Clear. Excludes the row's own employee and filters out non-active
  staff. Pre-fills with the existing covering teammate when one is set.

- **RowEditPanel `⤿` cover-up toggle**. Each day-row in the right-docked
  drawer with an existing assignment gains a small toggle that expands
  `<CoverUpPicker>` inline. Save and Clear commit immediately via the
  existing `scheduleApi.coverUp` endpoint. When a cover-up exists, the
  collapsed row shows a "covering <name>" hint in coral so users see
  state at a glance.

### Frontend tests
180 passed (was 164; +16):
- ModuleDisabled — 4
- RequireFeature — 4
- AdminModulesPage `?focus=` — 1
- CoverUpPicker — 5
- RowEditPanel ⤿ wiring — 2

### Backend tests
569 passed, 3 skipped (postgres-only). No backend changes.

### Notes
- No backend changes. The `cover-up` endpoint already exists; v1.5.1 just
  builds the missing UI for it.
- Notes on cover-up are not supported in v1.5.1 — the backend endpoint
  doesn't store a `notes` field on cover-up requests. Tracked as a v1.5.2
  candidate.
- Verified end-to-end via Playwright: empty-state renders for both admin
  (with Enable CTA → deep-link works) and non-admin (no CTA); cover-up
  Save → coral hint appears; Clear → hint disappears.

## [1.5.0] - 2026-05-06

**Phase 1 cleanup release — closes the perm-catalogue gap surfaced by the
v1.4.3 sweep, plus verification + documentation of the older audit items
that were already silently fixed.**

This release was scoped down from the original v1.5.0 punch list once
verification showed two of the four prior-audit items are already
addressed in the codebase. The remaining bigger items (empty-state
component, cover-up picker, UI quality cosmetic rewrites) require an
interactive design pass and ship in dedicated follow-up releases.

### Fixed
- **`manager`, `finance`, `team_lead`, `auditor` roles can now file and
  cancel their own leave.** Surfaced by the v1.4.3 5-role Playwright
  sweep. None of the four roles had `leave:request:create:self` or
  `leave:request:cancel:self` — so users with only one of those roles
  saw the Leave sidebar item hidden and got 403 from
  `POST /api/v1/leave/requests/`. M3 perm-catalogue gap, not a design
  decision. Added the two perms to all four roles in
  `default_roles.yaml`. Existing rows in the Provintell org backfilled
  via `grant_default_perms` (8 perm links added).
  (`apps/api/modules/identity/fixtures/default_roles.yaml`)

- **`grant_default_perms` now invalidates the per-user perm cache** after
  the `bulk_create` that adds new perms. Previously, the cache (60–300 s
  TTL) held the stale perm set so the backfill appeared to have no effect
  for ~5 minutes after running. Uses the existing
  `invalidate_role_users()` helper.
  (`apps/api/modules/identity/management/commands/grant_default_perms.py`)

### Verified-already-fixed (documented for closure)
The 2026-04-29 system-state audit listed four bugs. Two of them were
already resolved in later commits but the audit row was never closed:

- **Bug #1 — employee payslip detail 403** — fixed in v1.1.0/v1.2.0
  cycle. `PayslipViewSet.required_perms` (`apps/api/modules/payslip/views.py:39-47`)
  now returns `payslip:read:self` for `me`, `retrieve`, and `list`,
  matching the audit's recommended fix.
- **Bug #2 — payroll CSV upload null token** — fixed.
  `apps/web/src/modules/payslip/api.ts:91-92` now uses
  `tokenStorage.getAccess()`.
- **Bug #4 — cert/training celery beat unscheduled** — fixed.
  `apps/api/hrms_api/celery.py:20-30` schedules
  `detect-certification-expiry` (02:00) and `detect-training-overdue`
  (02:15) daily.

### Deferred (deliberately, with reasons)

- **Bug #3 — `HRMS_FIELD_ENCRYPTION_KEY` consolidation.** Both `api` and
  `worker` containers now share the same key (`5rrM…`). However, repo-root
  `.env` has a different unused key (`usD5…`), and `References/KEY.md`
  documents `usD5…` as the canonical key. The drift carries data-loss
  risk if mishandled (data encrypted under one key cannot be decrypted
  with the other). Deferred to a dedicated **key-management session**
  before first production deployment, where the user and Claude
  walk the rotation playbook (`docs/runbooks/rotate-encryption-keys.md`)
  together. Not a code-only fix.

- **Empty-state component for module-disabled pages** (Class C1 in the
  v1.5.0 prompt). After v1.4.2/4.3 fixes, sidebar/⌘K never link to a
  disabled-module page. The only remaining trigger is direct-URL
  navigation, where the page renders raw `GET /api/v1/X failed`. A
  proper empty-state component requires an interactive design pass.
  Tracked for v1.5.1.

- **Cover-up picker** (`window.prompt` replacement, Class C2). Same
  reason — UX surface needs design discussion, not a solo
  implementation. Tracked for v1.5.1.

- **UI-quality cosmetic rewrites** (Class D1). 7 pages in
  `2026-04-29-ui-quality.md` need PageHeader / ISO-date / StatusPill
  template applied. ~2h per page. Better as 7 atomic releases (v1.5.2
  through v1.5.8) than one mega-PR.

- **Roster v1.5 deferrals** (drag-and-drop, panel keyboard shortcuts,
  mobile redesign). Each needs its own spec. Phase 3 / future work.

### Backend tests
569 passed, 3 skipped (postgres-only). +4 from v1.4.3 (parametrized
`test_non_employee_roles_can_apply_for_own_leave` for manager / finance /
team_lead / auditor).

### Frontend tests
164 passed (no frontend changes in v1.5.0).

### Notes
- Per-user perm cache (`get_user_perms`) reads through Redis with 5-minute
  TTL. The cache-invalidation fix in `grant_default_perms` is the right
  general-case fix; mass-invalidation tools that bypass `bulk_create`
  signals should follow the same pattern.
- Audit reproduction record: `docs/audits/2026-05-06-module-key-mismatches.md`
  (Class D row updated in-place, since `docs/` is gitignored).

## [1.4.3] - 2026-05-06

**Sidebar Payroll item now hides in lockstep with the `payslip` feature flag.**

### Fixed
- `<Sidebar>` Payroll nav item declared `module: "payroll"` — but `payroll`
  is not a key in the backend feature-flag registry. The actual key for
  the payroll backend is `payslip`: `PayrollPeriodViewSet` and
  `PayrollRunViewSet` (`apps/api/modules/payslip/views.py`) are both
  wrapped in `@requires_feature("payslip")`.

  Because `useFeature(key)` returns `true` for unknown keys (intentional —
  newly added flags shouldn't blank-screen the UI before the registry
  catches up), the typo silently bypassed the flag check. Roles with
  `payroll:run:create` (org_admin, hr_manager, finance) saw the Payroll
  link regardless of `payslip` state. Click → backend 403 module_disabled
  → page renders the literal text `GET /api/v1/payroll/periods/ failed`.

  After v1.4.2 fixed feature-flag READ for non-admin users, this sidebar
  mismatch became the next-most-visible UX bug.

  (`apps/web/src/components/shell/sidebar-nav.ts`)

### Frontend tests
164 passed (was 162). Added 2 Sidebar regression tests:
- "hides Payroll when the payslip feature flag is disabled, even if perm is granted"
- "shows Payroll when the payslip feature flag is enabled and perm is granted"

The existing Sidebar tests now also explicitly mock `useFeature` so the
flag-vs-perm matrix is locked in.

### Backend tests
565 passed, 3 skipped (postgres-only — unchanged, no backend code changes).

### Notes
- 5-of-7 default roles re-verified via Playwright after the fix: org_admin,
  hr_manager, finance now hide Payroll when payslip is disabled (matches
  manager/employee, which already did via lacking the perm). Confirmed the
  symmetric "show on toggle ON" behavior with a live admin flag flip.
  `team_lead` and `auditor` have no demo accounts; sidebar logic is the
  same code path so no new risk.
- Audit reproduction record: `docs/audits/2026-05-06-module-key-mismatches.md`
  (local-only — `docs/` is gitignored).
- Defense-in-depth follow-up tracked for v1.5: a generic "module disabled"
  empty-state component for direct-URL navigation to disabled-module
  pages, instead of rendering a raw `GET /api/v1/X failed` string.

## [1.4.2] - 2026-05-06

**Module visibility + per-role API fixes — non-admin users now see the same
disabled-modules state admins configured.**

### Fixed
- **Sidebar / command palette correctly hide disabled modules for every
  role** (not just `org_admin`). `GET /api/v1/org/feature-flags/` was gated
  on `org:feature_flag:read`; non-admin users got 403, the
  `FeaturesProvider` caught the error and fail-opened (treating every flag
  as enabled), and disabled modules' nav links stayed visible. The endpoint
  now requires only authentication; PATCH still requires
  `org:feature_flag:write`. Flags describe org-level UI state, not secrets.
  (`apps/api/common/feature_flags/views.py`)
- **`GET /api/v1/certifications/me/`** filtered by
  `employee_id=request.user.id`, but the FK target is `Employee.id` (per
  `seed_demo_data.py:1207`). Real seeded employees got an empty list
  instead of their own certifications. Now resolves User → Employee first,
  matching the `PayslipViewSet.me` pattern; returns `[]` if the user has no
  linked Employee. Latent in v1.4.0/v1.4.1 because the certification module
  was disabled (decorator returned 403 before the bad filter ever ran).
  (`apps/api/modules/certification/views.py`)
- **`GET /api/v1/training/assignments/me/`** — same bug pattern, same fix.

### Backend tests
565 passed (was 559) + 3 pre-existing skipped (postgres-only).
Added 3 regression tests:
- `feature_flags::test_list_visible_to_any_authenticated_user`
- `certification::test_my_certifications_empty_when_user_has_no_employee`
- `certification::test_my_assignments_empty_when_user_has_no_employee`
Plus the existing `test_my_certifications` and `test_my_assignments` were
updated to mirror production seed semantics (Cert/TrainingAssignment
`employee_id` is `Employee.id`, not `User.id`).

### Frontend tests
162 passed (unchanged — no frontend code changes).

### Notes
- This is a security-neutral perm change. Feature-flag state describes
  which UI surfaces a given org has enabled. It is not secret data and is
  already implicitly visible (a 403 from `@requires_feature` reveals the
  same information). The PATCH endpoint remains gated.
- Audit reproduction record: `docs/audits/2026-05-06-module-visibility.md`
  (local-only — `docs/` is gitignored).

## [1.4.1] - 2026-05-02

**Roster UX polish — per-employee side panel replaces the cell popover.**

### Added
- **`<RowEditPanel>`** — right-docked drawer for per-employee editing. Opens on cell click (scrolled to clicked day) or on employee-name click (whole row). Top: weekday-pattern picker + `[1mo|2mo|3mo]` toggle + Apply button. Bottom: scrollable day list with one inline dropdown per date. Sticky Save bar with pending count.
- **Optimistic preview**: pending edits in the panel render immediately in the main grid via a shared `pendingEdits` map. Save commits via existing `bulk-fill` (per shift) + `deleteAssignment`. Cancel rolls everything back without an API call.
- **Cell focus indicator**: clicked cell gets a heavier violet ring while panel is open with that cell focused.
- **Coral dot merged meaning**: same indicator now signals both "unsaved" and "unpublished".

### Changed
- `<RosterGrid>` API: `onCellClick` → `onCellOpen({employee_id, date})`; new props `onRowOpen`, `pendingEdits`, `focusedEmployeeId`, `focusedDate`.
- `<RosterCell>` API: new `focused?: boolean` and `pendingEdit?: boolean` props.
- Pattern Apply still uses the existing `bulk-pattern` endpoint, but commits server-side immediately (with confirm dialog and a "discard N drafts" warning if pending edits exist).

### Removed
- `<CellPopover>` component + tests — replaced by `<RowEditPanel>`. Cover-up flow continues to use `window.prompt` (proper picker remains v1.5).

### Frontend tests
~162 (was 145; +12 RowEditPanel + 2 RosterCell + 2 RosterGrid + 1 RosterPage − 3 CellPopover deletion).

### Backend tests
559 passed (no backend changes; pre-existing attendance failure carried).

## [1.4.0] - 2026-05-02

**Roster redesign — unified Week/Month planning page on the v1.1.0 theme.**

### Added
- **Roster page** (`/admin/schedule`): unified Week/Month view toggle (persisted per-user). Click cells to edit; shift-click extends a lasso selection that fills via a single API call. Toolbar with date nav, view toggle, team + search filters, warnings indicator, Build Roster + Publish actions.
- **Cell tone system** (`apps/web/src/modules/schedule/lib/cell-tone.ts`): priority-ordered resolver — inactive employees show striped canvas; approved leaves show mint; cover-up shifts get a coral border; M=violet, D=lavender, N=sky, S=yellow.
- **Backend `Team` model** (`modules/employee/Team`): nullable parent_team for nesting, sort_order, optional min_headcount for coverage warnings.
- **Backend `Shift.code`** field (1–3 chars, unique-per-org). Existing shifts auto-backfill to `name[:1].upper()`.
- **Backend `ShiftAssignment.covering_for`** FK with self-reference guard (validated in both `clean()` and `save()`).
- **Endpoints**: `GET /api/v1/schedule/shift-assignments/calendar/` (single-read calendar payload with assignments + leaves + holidays + stats + coverage), `POST /api/v1/schedule/shift-assignments/bulk-fill/` (cell-list lasso fill), `PATCH /api/v1/schedule/shift-assignments/{id}/cover-up/`, full Team CRUD at `/api/v1/teams/`.
- **Permissions**: `team:read` (org_admin + hr_manager + manager + team_lead default), `team:write` (org_admin + hr_manager only).
- **Soft warnings** on bulk-fill: leave overlap, employee >48h scheduled in week, team drops under min_headcount. Display only — never block save.
- **MySchedulePage refresh** uses the shared cell-tone system + RosterCell component.
- **Employee.full_name** as a model `@property` — consolidates derivation from EmployeeSerializer.

### Changed
- `seed_provintell` now seeds 6 teams (Team Lead, Team Focus, Team Commitment, 24x7 Standby [min_headcount=2], Level 2 CyberLAB [parent: 24x7 Standby], Level 3 CloudOps) and links the 5 PVT-* employees by role_title.
- `seed_provintell` Day/Night shifts now carry `code` values (D, N) — fixes a constraint conflict that surfaced after the Shift.code requirement landed.
- `as never` casts removed from `apps/web/src/modules/admin/api.ts` and the new schedule endpoint helpers in `apps/web/src/modules/schedule/api.ts`.

### Backend tests
559 passed (was 506). 1 pre-existing attendance failure (test_clock_out_completes_record) carried forward from v1.3.0.

### Frontend tests
145 passed (was 119).

## [1.3.0] - 2026-04-30

**Admin tools — system admin can configure roles, permissions, and modules from the UI.**

### Added
- **Feature 1 — Per-user role assignment**: `org_admin` (and any role with `role:write`) can assign system roles to any user via a new "Edit roles" dialog on the Employee detail page. New endpoint `PATCH /api/v1/users/{id}/roles/`. Includes self-demote guard (cannot remove your own `role:write`) and last-admin guard (cannot strip the only `role:write` holder).
- **Feature 2 — Per-role permission editor**: new admin pages `/admin/roles` (list) and `/admin/roles/{code}` (matrix). Admin can toggle individual permissions for any of the 7 system roles, save, or reset to defaults. New endpoints `GET /api/v1/roles/`, `GET /api/v1/roles/{code}/`, `PATCH /api/v1/roles/{code}/permissions/`, `POST /api/v1/roles/{code}/reset-to-defaults/`. Includes guard that `org_admin` keeps `role:read` + `role:write` so admins cannot lock themselves out.
- **Feature 3 — Per-org feature flags**: new admin page `/admin/modules` with toggles for 10 togglable modules (Leave, Schedule, Attendance, Claims, Payslip, KPI, Certifications, Training, Reports, Notifications). 3 critical modules (Identity, Employee, Organization) and 2 derived (Approvals, Dashboard) shown as read-only. New `common.feature_flags` Django app with `FeatureFlag` model, `is_enabled` cascade service, Redis-cached lookups (60s TTL), `@requires_feature` decorator, and endpoints `GET /api/v1/org/feature-flags/` + `PATCH /api/v1/org/feature-flags/{key}/`.
- **Permissions**: new permission codes `org:feature_flag:read` and `org:feature_flag:write`, granted to `org_admin` by default.
- **Frontend**: `FeaturesProvider` + `useFeature(key)` hook gates the sidebar and ⌘K command palette. Sidebar gains a new "Roles" and "Modules" link in the Admin group.

### Changed
- `seed_default_roles` management command switches from destructive SYNC semantics to **create-if-absent**: existing roles' permission sets are preserved across deploys, so admin edits survive seeding.
- All 10 togglable ViewSets (`LeaveRequestViewSet`, `ScheduleAssignmentViewSet`, `ClockEventViewSet`, `ClaimViewSet`, `PayslipViewSet`, `KPIAssignmentViewSet`, `CertificationViewSet`, `TrainingViewSet`, `ReportViewSet`, `NotificationViewSet`) wear the `@requires_feature` decorator; disabled modules return a 403 with `code: "module_disabled"` and detail `"Module 'X' is disabled for this organisation"`.

### Backend tests
506 passed, 3 skipped (was 463). Count rises from new role-admin endpoints, feature-flag service, decorator integration, and audit-log smoke tests.

### Frontend tests
119 passed (was 92). Coverage added for `FeaturesProvider`, admin API client, AdminRolesPage, AdminRoleDetailPage, RolesCard, AdminModulesPage.

## [1.2.0] - 2026-04-29

**HRMS Phase 1 complete — polish pass closing all v1.1.0 gaps.**

### Added
- **A1 — `role_codes` in `/api/v1/auth/me`**: `MeSerializer` now returns `role_codes: list[str]` from `UserRole`. `AuthContext.roles` is populated from this field; the UserMenu now shows real role labels instead of the "Member" placeholder.
- **A2 — KPI reviews in unified Approvals inbox**: `get_inbox()` service extended to include `KpiAssignment` rows in `manager_review` cycles where the current user is the employee's direct manager. `InboxItem.kind` gains `"kpi"`. Frontend `api.ts` and `UnifiedInboxPage` KPI filter count now live.
- **B1 — `/me/preferences` page** (`apps/web/src/modules/auth/pages/PreferencesPage.tsx`): unified preferences hub — locale dropdown (en-MY), theme stub ("Coming soon — Phase 1.5"), MFA enrollment section (QR-code modal + 6-digit confirm), notification preference matrix, and "Sign out all sessions" button wired to `/api/v1/auth/sessions/revoke-all/`.
- **B2 — Employee detail page** (`/employees/:id`): read-only employee profile with avatar card, Employment section, Personal section (gated by `employee:read:org`), Reporting chain, Direct reports. `EmployeesPage` card clicks now navigate to the detail view.
- **B3 — Forgot-password + reset-password pages**: `ForgotPasswordPage` and `ResetPasswordPage` under `/forgot-password` and `/reset-password`. Public routes; redirect to `/` if already signed in. LoginForm "Forgot?" link was already routing to `/forgot-password`.
- **B4 — MFA enrollment UX polish**: QR-code generation added to the `mfa/enable` backend endpoint (returns `qr_code` as a base64 PNG data URL). Confirm modal in `/me/preferences` displays the QR code and manual key, then prompts for 6-digit code to finalize.
- **C1 — SMTP env documentation**: `.env.example` expanded with a labelled "production SMTP" block. `docs/runbooks/deploy-prod.md` gains a "Configure SMTP" section with env-var table, Docker exec test command, and Gmail app-password guidance.

### Changed
- `AuthContext.roles` is now sourced from `data.role_codes` returned by `/api/v1/auth/me`; placeholder comment removed.
- Approvals inbox KPI count is live (was hardcoded `0`).
- `qrcode[pil]` added to backend dependencies for MFA QR generation.

### Deferred
- Dark/light theme toggle (Phase 1.5 — separate effort; theme section in `/me/preferences` shows "Coming soon" stub).

## [1.1.0] - 2026-04-29

**HRMS UI/UX Redesign — Design_1 themes + Design_2 UX.**

Replaces the placeholder light-theme top-bar UI with a dark-themed sidebar shell + 5 redesigned signature pages. No backend changes.

### Added
- Design token system: 10 surface/text colors, 5-step violet accent ramp, 6 pastels (peach / lavender / mint / yellow / coral / sky), 5-step type scale (Inter + JetBrains Mono), motion durations (instant / fast / base / slow), reduced-motion fallback.
- 21 themed shadcn/ui primitives committed under `apps/web/src/components/ui/` (Button, Input, Dialog, Sheet, DropdownMenu, Command, Calendar, etc.).
- 13 HRMS-specific composed components under `apps/web/src/components/hrms/`: KpiTile, EmployeeCard, DataTable, DetailPanel, DonutChart, ProgressBar, ApprovalActionBar, ClockInOutWidget, AttendanceLogRow, FileUploader, NotificationCard, EmptyState, StatusPill.
- New shell: AppShell (2-col grid 220px sidebar + main), Sidebar with grouped Personal/Team/Admin nav and perm-gated items, TopBar with breadcrumb + ⌘K + bell + UserMenu, PageHeader, UserMenu dropdown.
- ⌘K command palette (`@/components/shell/CommandPalette`) with Pages / Employees fuzzy search / Quick actions; keyboard shortcut wired globally.
- Redesigned signature pages: Dashboard (3 variants — `/me`, `/team`, `/admin`), Employees directory (card grid + table toggle + department filter), Leave page (KPI tiles + DataTable + DetailPanel), Unified Approvals inbox (split list + filter pills + ApprovalActionBar), My Profile (avatar card + sectioned details + MFA-flagged Banking).
- `axe-core/react` wired in dev mode to surface a11y violations live in the console.
- Lighthouse a11y audit script: `apps/web/scripts/lighthouse.sh` (asserts ≥ 95 a11y on signature pages).
- Frontend test count: 86 (up from 10 at v1.0.0).

### Changed
- Old TopBar's per-link nav block (My Profile / Leave / Approvals / Schedule / Roster / Claims / Payslips / Payroll / KPI / Certifications / Reports) removed in favour of the grouped Sidebar.
- AppShell layout switched from a vertical flex stack with a top bar to a 2-column dark grid (sidebar + main column).
- Dashboard cards (BirthdaysCard, CertsExpiringCard, KpiProgressCard, LeaveBalanceCard, PendingApprovalsCard, RecentClaimsCard, TodayAttendanceCard, UpcomingHolidaysCard) rewritten to use the new tokens.
- AuthContext extended with `roles: string[]` placeholder (defaults to `[]` until `/api/v1/auth/me` exposes role codes).

### Spec / plan
- Spec: `docs/superpowers/specs/2026-04-28-hrms-ui-redesign.md`
- Plans: `docs/superpowers/plans/2026-04-28-hrms-ui-{roadmap,foundation,components,pages,polish}.md`

### Outstanding (deferred)
- `/api/v1/auth/me` should expose `role_codes: list[str]` so the UserMenu shows real role labels instead of "Member" fallback.
- `/api/v1/approvals/inbox` doesn't yet include KPI reviews — the KPI filter pill in the Approvals inbox shows a count of 0.

## [1.0.0] - 2026-04-28

**HRMS Phase 1 — Production Release.**

Phase 1 delivers a complete web HRMS for Provintell with all 12 milestones shipped:

### Core platform (M0–M2)
- Repo scaffold, Docker Compose, CI/CD, pre-commit
- Multi-tenant-ready Django + DRF backend, React + Vite frontend
- Identity, RBAC (HRMSPermission + TenantContext), audit log + chained payroll ledger
- Tier-2 Employee directory with encrypted IC/bank/tax IDs (LHDN/EPF/SOCSO/EIS)

### Feature modules (M3–M8)
- Workflow engine (subject-agnostic; reused by Leave, Claims, KPI)
- Leave with balances, ledger, approvals, holiday-replacement rule
- Schedule (shifts, rosters, publish) + Attendance (clock-in/out, fail-soft holiday detection)
- Claims with 3-tier approval chains keyed by amount band
- Payroll CSV import + PDF generation + payroll-ledger writes
- KPI cycles with snapshot pattern for historical preservation
- Certification & training with daily expiry-reminder cron

### UX & operations (M9–M12)
- Notifications system with email digest batching
- Unified approvals inbox + role-aware dashboards
- Reports framework with 15 registered reports + CSV/XLSX/PDF export
- Backup verification + Prometheus alerts + Grafana dashboards + 9 runbooks
- Provintell launch seed data + 2-week parallel-run validation

### By the numbers
- 13 tagged releases (`v0.1.0-m{0..11}` → `v1.0.0`)
- ~480 backend tests + ~10 frontend tests, all green
- 105 permission codes
- 13 modules: identity, organization, employee, leave, schedule, attendance, claims, payslip, kpi, certification, notification, dashboard, reporting + common.audit + common.workflow + common.reporting
- Multi-country-ready schema; English (en-MY) + Malaysia (MYR / Asia/Kuala_Lumpur) seeded at launch

### Phase 2 / Phase 3 are separate engagements
- Phase 2: SaaS subscription model, plan-based feature gating, billing
- Phase 3: Mobile app reusing the Phase 1 APIs

**Tag policy change:** `v0.1.0-mN` milestone tags retire here. Future releases follow semver `vMAJOR.MINOR.PATCH`.

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
