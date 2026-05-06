# Changelog

All notable changes documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
