# HRMS — Claude Operating Manual

> Read this file at the start of every session. It is the source of truth for
> "where are we?" and "how do we change code here?". Git is the only thing
> that overrules it.

## 1. Project at a glance

- **Stack** — Django 5 + DRF (`apps/api`) · React 18 + Vite + TS + Tailwind (`apps/web`) · Postgres 16 · Redis · Celery · MinIO/S3 · Docker Compose
- **Layout** — `apps/api`, `apps/web`, `packages/contracts` (generated OpenAPI → TS types), `deploy/`, `docs/` (specs, plans, audits, runbooks), `References/` (design + ops notes)
- **Current version** — `v1.7.1` on `master` (tag dated 2026-05-07). Triple-source-of-truth: `apps/web/package.json`, `apps/api/pyproject.toml`, `apps/api/hrms_api/settings/base.py` (`SPECTACULAR_SETTINGS.VERSION`)
- **Mission** — Phase 1 web HRMS for Provintell (own-office deployment first). Phase 2 = SaaS, Phase 3 = mobile.
- **Tenancy / locale** — multi-tenant-ready schema, `Asia/Kuala_Lumpur`, `en-MY`, MYR.
- **Day-one demo logins** — see `References/KEY.md`. Do not commit changes that break them.

## 2. Progress tracker

### 2.1 Milestones — Phase 1 (M0 → M12)

All shipped. Each row is anchored on a real git tag.

| Milestone | Scope | Tag (date) | Spec | Plan(s) |
|---|---|---|---|---|
| M0 | Repo scaffold, CI, Docker, OpenAPI codegen | `v0.1.0-m0` (2026-04-27) | `docs/superpowers/specs/2026-04-27-hrms-design.md` | `docs/superpowers/plans/2026-04-27-hrms-m0-repo-scaffold.md` |
| M1 | Identity (User, Roles, RBAC, MFA, Audit) + frontend auth | `v0.1.0-m1` (2026-04-28) | same design spec | `m1a-foundations`, `m1b1-user-roles`, `m1b2-auth-mfa-sessions`, `m1b3-rbac`, `m1b4-audit-org-settings`, `m1c-frontend-auth` |
| M2 | Employee directory Tier 2 (encrypted PII) | `v0.1.0-m2` (2026-04-28) | same | `m2a-employee-core`, `m2b-employee-finishers` |
| M3 | Workflow engine + Leave (balances, ledger, approvals) | `v0.1.0-m3` (2026-04-28) | same | `m3a-workflow-engine`, `m3b-leave-types-balances`, `m3c-leave-requests`, `m3d-frontend-leave` |
| M4 | Schedule + Attendance (clock-in/out, holiday-replacement) | `v0.1.0-m4` (2026-04-28) | same | `m4a-schedule`, `m4b-attendance`, `m4c-frontend-attendance` |
| M5 | Claims (3-tier amount-band approvals + S3 attachments) | `v0.1.0-m5` (2026-04-28) | same | `m5a-claims-backend`, `m5b-claims-frontend` |
| M6 | Payslip + Payroll CSV + chained payroll ledger | `v0.1.0-m6` (2026-04-28) | same | `m6-payslip-payroll` |
| M7 | KPI cycles (snapshot pattern) | `v0.1.0-m7` (2026-04-28) | same | `m7-kpi` |
| M8 | Certification + Training (90/60/30 reminder cron) | `v0.1.0-m8` (2026-04-28) | same | `m8-certification-training` |
| M9 | Notifications (preferences + email digest) | `v0.1.0-m9` (2026-04-28) | same | `m9-notifications` |
| M10 | Dashboards + Unified Approvals Inbox | `v0.1.0-m10` (2026-04-28) | same | `m10-dashboards-inbox` |
| M11 | Reports framework + 15 reports (CSV/XLSX/PDF) | `v0.1.0-m11` (2026-04-28) | same | `m11-reports` |
| M12 | Hardening + Provintell launch + 9 runbooks → **v1.0.0** | `v1.0.0` (2026-04-28) | same | `m12-hardening` |

### 2.2 Patch / minor releases on top of v1.0.0

| Tag | Date | Scope | Spec | Plan(s) |
|---|---|---|---|---|
| `v1.1.0` | 2026-04-29 | Dark sidebar UI redesign + shadcn primitives + 21 components + 13 hrms composites | `2026-04-28-hrms-ui-redesign.md` | `hrms-ui-{roadmap,foundation,components,pages,polish}.md` |
| `v1.2.0` | 2026-04-29 | Phase 1 polish — `role_codes` in `/me`, KPI inbox, Preferences page, Employee detail, forgot-/reset-password, MFA QR | (no new spec — closes v1.1.0 deferrals) | (single feat commit `a640d60`) |
| `v1.3.0` | 2026-04-30 | Admin tools — per-user roles, per-role perm matrix, per-org feature flags | `2026-04-30-hrms-admin-tools.md` | `hrms-admin-{roadmap,A-backend-roles,B-backend-flags,C-frontend,D-polish}.md` |
| `v1.4.0` | 2026-05-02 | Roster redesign — unified Week/Month grid, Team model, `Shift.code`, `ShiftAssignment.covering_for`, calendar/bulk-fill/cover-up endpoints | `2026-05-02-roster-redesign.md` | `hrms-roster-{roadmap,A-data,B-endpoints,C-frontend,D-polish}.md` |
| `v1.4.1` | 2026-05-04 | Roster UX polish — `RowEditPanel` per-employee drawer, optimistic preview, focus ring, pattern apply 1/2/3 months | `2026-05-02-roster-ux-polish.md` | `2026-05-02-roster-ux-polish.md` |
| `v1.4.2` | 2026-05-06 | Module visibility — non-admin roles now hide admin-disabled modules in sidebar / command palette; cert/me + training/me filter by Employee.id (latent bug) | (no spec — bugfix) | (no plan — direct fix) |
| `v1.4.3` | 2026-05-06 | Sidebar Payroll module-key typo — was `module: "payroll"`, must match backend's `@requires_feature("payslip")`. Affected org_admin / hr_manager / finance | (no spec — typo fix) | (no plan — one-liner) |
| `v1.5.0` | 2026-05-06 | Phase 1 cleanup — manager/finance/team_lead/auditor can now file own leave; `grant_default_perms` now busts perm cache; older audit rows verified-fixed and closed | (no spec — bugfix) | (no plan — one-liner) |
| `v1.5.1` | 2026-05-06 | Module-disabled empty-state component + cover-up picker UI; route-level `<RequireFeature>` wrapper + `withFeature` helper; AdminModulesPage `?focus=` deep-link | `2026-05-06-v1.5.1-empty-state-and-coverup.md` | `2026-05-06-v1.5.1-empty-state-and-coverup.md` |
| `v1.6.0` | 2026-05-07 | Employee CRUD UI (/employees/new + /employees/:id/edit shared form, encrypted-field "Replace" modal, MFA on bank edit) + Team CRUD page (/admin/teams) + new `employee:assign:team` perm-narrow PATCH lane for team_lead/manager re-team without broader edit access | `2026-05-07-v1.6.0-employee-team-crud.md` | `2026-05-07-v1.6.0-employee-team-crud.md` |
| `v1.6.1` | 2026-05-07 | Backend follow-up to v1.6.0 — `GET /employees/{id}/` now also accepts `employee:assign:team` so team_lead/manager's edit page pre-fills (closes spec §9.1 #4 gap surfaced by Playwright sweep). Encrypted PII still hidden via write-only serializer fields | (no spec — bugfix) | (no plan — one-liner) |
| `v1.6.2` | 2026-05-07 | `<ManagerPicker>` rebuilt as a Popover-based combobox — dropdown now closes on selection / Escape / outside-click. v1.6.0 had cmdk's `<Command>` inline as an always-open list. Prop contract unchanged | `Prompt_v1.6.2_manager_picker_dropdown_fix.md` | (no plan — single-component) |
| `v1.7.0` | 2026-05-07 | Employee self-edit on /me/profile (inline-section editing wires the long-stubbed Edit buttons to PATCH /me/) + Profile pictures for everyone (presigned-PUT to MinIO + Celery resize to 512x512 WebP + EXIF strip; HR can upload-on-behalf on /employees/:id/edit). Adds `Employee.photo_s3_key` and 6 photo endpoints. Shared `<MfaPrompt>` extracted. No new perm codes. | `2026-05-07-v1.7.0-self-edit-and-photos.md` | `2026-05-07-v1.7.0-self-edit-and-photos.md` |
| `v1.7.1` | 2026-05-07 | Backend follow-up to v1.7.0 — `employee:write:self` granted to manager/finance/team_lead/auditor (pre-existing M2 gap surfaced by Playwright sweep: those roles had `read:self` but never `write:self`, so v1.7.0's new `/me/profile` editing 403'd for them). Fixture-only change. | (no spec — bugfix) | (no plan — one-liner) |
| `v1.8.0` | 2026-05-08 | Leave module enhancement — admin `/admin/leave-types` page (General + Tenure tiers + Carry-forward tabs), per-employee `EmployeeLeaveOverride` (HR-only), idempotent Celery year-rollover (Jan 1) + daily expiry-sweep (02:30 KL), §60E by-month proration, statutory eligibility validators (paternity 12-mo service + 30-d notice + 5-confinement cap), MY country fixture upgraded to 8/12/16 annual + 14/18/22 sick + new HOSPITALIZATION 60d leave type (post-2022 §60F separation). No new perm codes. | `2026-05-07-v1.8.0-leave-module-enhancement.md` | `2026-05-07-v1.8.0-leave-module-enhancement.md` |

### 2.3 Test counts at HEAD (v1.7.0)

- Backend: **593 passed** + 3 skipped (postgres-only triggers). +12 from v1.6.2 across `test_avatar_endpoints.py` (8), `test_avatar_task.py` (3), and a `photo_url` regression in `test_views_me.py`.
- Frontend: **227 passed** (was 213 at v1.6.2; +14 across MfaPrompt (3), AvatarUpload (5), MyProfilePage (+6)).
- Permission codes: **110** (no change since v1.6.0; v1.7.0 adds no perm codes).

### 2.4 In-flight / next up

- **Working tree at HEAD** — only `apps/api/uv.lock` modified; untracked `.claude/` and `.playwright-mcp/`. No half-finished feature branches.
- **Local tags not pushed** — `v1.7.1` is local-only on `master`. (v1.7.0 and earlier already pushed to `origin = git@github.com:dyxentitor/HRManagement.git`.) Confirm with the user before `git push`.
- **Audit closure status**:
  - `2026-04-29-system-state.md` — Bug #1 (payslip detail 403): **FIXED**. Bug #2 (payroll CSV null token): **FIXED**. Bug #3 (encryption-key drift): **FIXED** (config consolidation 2026-05-06; `.env` and `References/KEY.md` now match the runtime key `5rrM…`; `:?` guard in compose prevents future silent drift; runbook rotation infrastructure — `PREV_KEY` + `reencrypt_sensitive_fields` cmd — still needs to be built when rotation is actually scheduled). Bug #4 (cert/training beat tasks): **FIXED**.
  - `2026-04-29-ui-quality.md` — "FAIL" rows still pending; cosmetic; v1.5.2–v1.5.8 candidates.
  - `2026-05-06-module-visibility.md` — driving v1.4.2 — **FIXED**.
  - `2026-05-06-module-key-mismatches.md` — driving v1.4.3 + v1.5.0 (Class D leave-perm row) — **FIXED**.
- **Pending — mechanical, can ship anytime**:
  - **v1.5.2: Notes on cover-up** — small backend change to accept + persist `notes` on `PATCH /shift-assignments/{id}/cover-up/`, plus a notes textarea in `<CoverUpPicker>`. Spec-deferred from v1.5.1 because the backend endpoint doesn't currently store notes.
  - **v1.5.3–v1.5.9** (one per page): UI-quality cosmetic rewrites — PageHeader / `toLocaleDateString` / StatusPill template applied to MyCertificationsPage, MyTrainingPage, AdminCertPage, MySchedulePage, KpiAdminPage, MyClaimsPage, MyPayslipsPage. ~2h per page.
- **Pending — needs spec before implementation**:
  - Roster drag-and-drop, panel keyboard shortcuts, proper mobile redesign — each its own brainstorm + spec + plan cycle.
- **Phase 2 / Phase 3** — separate engagements: SaaS billing + plan-based gating; React Native mobile.

## 3. Code change hygiene

### 3.1 Workflow — every non-trivial change

1. **Brainstorm** (`superpowers:brainstorming`) to lock intent + scope.
2. **Spec** at `docs/superpowers/specs/YYYY-MM-DD-<slug>.md` (decisions, non-goals, architecture summary).
3. **Plan** at `docs/superpowers/plans/YYYY-MM-DD-<slug>.md` (`superpowers:writing-plans`). Sub-plans (A/B/C/D) for milestone-sized work — see admin-tools and roster as templates.
4. **Execute** — inline for small plans, `superpowers:subagent-driven-development` or `executing-plans` for larger ones.
5. **Verify** (`superpowers:verification-before-completion`) — run lint + typecheck + tests, walk the feature in the browser when frontend.

### 3.2 Commit discipline

- One task in the plan = one commit. Conventional prefixes already in use: `feat(scope):`, `fix(scope):`, `chore(release):`, `refactor(scope):`, `test(scope):`, `docs(scope):`, `build(...)`, `ci(...)`, `ops(...)`.
- Trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Stage by name, not `git add -A`. Never commit `.env`, `.claude/`, `.playwright-mcp/`, MinIO data.
- **Never** `--no-verify`. **Never** `--amend` to "fix" a failed hook — re-stage and create a NEW commit (the original commit didn't happen, amending would rewrite the *previous* one).

### 3.3 Pre-commit gates (configured in `.pre-commit-config.yaml`)

- `pre-commit-hooks`: merge-conflict, json/yaml, EOF, trailing whitespace, case conflict, large files (≥1024kb), private key, LF line endings.
- `ruff` (--fix) + `ruff-format` on `apps/api/`.
- `biome-check` on `apps/web/**/*.{ts,tsx,js,jsx,json}`.
- `detect-secrets` against `.secrets.baseline` — for legitimate test fixtures use `# pragma: allowlist secret`.
- CI (`.github/workflows/ci.yml`) re-runs lint + tests + contracts drift + security on push.

### 3.4 Test discipline

- Backend: `make test-api` → `pytest -n auto --cov` from `apps/api/`. New code ships with tests.
- Frontend: `make test-web` → `pnpm test` (vitest + Testing Library + happy-dom + msw). Components get a sibling `*.test.tsx`.
- Both must be green before commit. Pre-existing failures carry forward only when CHANGELOG documents them.

### 3.5 Lint, typecheck, contracts

- `make lint` → ruff (api) + ruff format check + biome (web) + tsc.
- `make typecheck` → mypy on `hrms_api modules common`.
- `make contracts` regenerates `packages/contracts/openapi.yaml` + TS types when DRF schemas change. Commit the result.

### 3.6 Migration safety

- Schema migrations are **additive**. Never edit a migration that has been run anywhere.
- Seeders use `get_or_create` — see `seed_default_roles` (rewrite from destructive sync to create-if-absent in v1.3.0 was load-bearing: admin edits survive deploys).
- For backfilling permissions / flags onto rows that already exist, write a separate idempotent management command. Canonical example: `apps/api/modules/identity/management/commands/grant_default_perms.py` (added in v1.4.0 to fix the 403 on `/api/v1/teams/`).
- `seed_provintell` is idempotent and never revives soft-deleted rows (commit `c3be2a9` codifies this).

### 3.7 Frontend resilience

- **Decoupled try blocks** for required-vs-optional endpoints. The roster page must render when `/teams/` 403s — calendar fetch fails hard, teams fetch fails soft (empty list). Pattern in `apps/web/src/modules/schedule/pages/RosterPage.tsx::refresh()`.
- Token storage uses `tokenStorage.getAccess()` from `@/lib/token-storage`. Never `localStorage.getItem("access_token")` directly — that's the v1.1.0 payroll-upload bug class.

### 3.8 Design system contract (from v1.1.0)

- Tokens only — no raw hex outside `apps/web/src/index.css` and `tailwind.config.ts`.
- Palette: dark navy canvas, 5-step violet accent, 6 pastels (peach / lavender / mint / yellow / coral / sky).
- Type: Inter + JetBrains Mono, 5-step scale. Motion: instant / fast / base / slow + reduced-motion fallback.
- Use the shadcn primitives at `apps/web/src/components/ui/` and the HRMS composites at `apps/web/src/components/hrms/`. New visual elements extend, don't fork.
- Cell-tone resolver lives at `apps/web/src/modules/schedule/lib/cell-tone.ts` — extend the priority list, don't duplicate.
- Every interactive `<button>` needs `type="button"` (biome `useButtonType`).

### 3.9 Date arithmetic

- Shared grids that span days use **UTC-only** date math. Pattern: `new Date(\`${iso}T00:00:00Z\`)` then `setUTCDate(getUTCDate() + 1)`. Used in `RosterGrid.buildDateRange` and `RowEditPanel`.
- `toISOString().slice(0,10)` on a local-tz Date will drift one day in `Asia/Kuala_Lumpur`. Don't use it as a date key.
- Backend: `TIME_ZONE = "Asia/Kuala_Lumpur"` in prod settings, `UTC` in test settings (so `localdate()` doesn't cross midnight under freeze_time).

### 3.10 Encryption + security

- `EncryptedCharField` (Fernet) wraps IC / bank / LHDN / EPF / SOCSO / EIS. The key (`HRMS_FIELD_ENCRYPTION_KEY`) must be a 32-byte url-safe base64 string — generate with `Fernet.generate_key()`, never hand-roll.
- One key everywhere — `.env` and any `docker-compose` env block must agree, otherwise data written by the API can't be read by the worker (v1.1.0 audit Bug #3).
- Bank-detail edits require fresh MFA via `X-MFA-Code` header (M2b).
- Argon2id passwords. JWT access 15 min / refresh 7 days, rotation + blacklist.

### 3.11 Audit + ledger invariants

- `audit_log` (Tier-1) is append-only via Postgres trigger.
- `payroll_audit_ledger` is a hash chain — verify with `from common.audit import verify_payroll_chain`.
- Every `submit/approve/reject/cancel` writes one `audit_log` row. Payslip publish writes one audit + one payroll-ledger row.
- Workflow signals: use `workflow_approved` (terminal) for final-step notifications, NOT `workflow_step_approved` (fires before status flips).

### 3.12 Version bump procedure (release flow)

1. Bump `apps/web/package.json` → `version`.
2. Bump `apps/api/pyproject.toml` → `version`.
3. Bump `apps/api/hrms_api/settings/base.py` → `SPECTACULAR_SETTINGS["VERSION"]`.
4. Add a dated section to `CHANGELOG.md` with full scope (Added / Changed / Removed / Deferred / test counts).
5. Commit as `chore(release): vX.Y.Z — <one-line summary>` (atomic, with the trailer).
6. `git tag vX.Y.Z`.
7. **Stop.** Don't `git push` unless the user explicitly says so. The convention is local tag → user reviews → user authorises push.

### 3.13 Destructive-action policy

- No `git push --force` to `main`/`master` ever.
- No `git reset --hard`, no `git clean -f`, no `branch -D`, no `rm -rf` without explicit ask.
- If a hook fails: read the error, fix the file, recommit. Don't bypass.
- If you find unfamiliar files (`.claude/`, `.playwright-mcp/`, half-written branches), investigate before deleting — they may be the user's in-progress work.
- For risky / hard-to-reverse operations: state intent, ask, then act.

### 3.14 Feature-flag READ contract (added v1.4.2)

- `GET /api/v1/org/feature-flags/` is open to **any authenticated user** in
  the org. The frontend `FeaturesProvider` relies on this to hide disabled
  modules in sidebar / command palette. Gating it on `org:feature_flag:read`
  caused the v1.4.1 regression where managers / employees saw disabled
  modules and clicked into 403s.
- `PATCH /api/v1/org/feature-flags/{key}/` stays gated on
  `org:feature_flag:write` (org_admin only).
- Flags describe **org-level UI visibility, not secrets.** A 403 from
  `@requires_feature` already reveals the same information. Reading the
  full list is no more disclosure than that.
- **Frontend pattern:** `FeaturesProvider` fail-opens on fetch error
  (treats every flag as enabled). This is correct UX given flags aren't
  secret; do not change to fail-closed without re-thinking the whole story
  — fail-closed would hide every nav item including admin's during slow
  networks.

### 3.15 Test fixture realism (added v1.4.2)

When a model has a UUID column that's *meant* to be an FK to another
model but lacks the DB-level constraint (e.g., `Certification.employee_id`
= `models.UUIDField()` not `ForeignKey(Employee)`), tests **must** mirror
production seed semantics. The cert/me filter bug existed for a year
because the test fixture put `User.id` directly into `Certification.employee_id`,
matching the buggy view filter. The bug only surfaced once tests were
rewritten to use a real `Employee` row.

Rule of thumb: if `seed_provintell.py` or `seed_demo_data.py` writes
`employee_id=emp.id` (Employee row), the tests must do the same — never
shortcut by reusing the User UUID.

### 3.16 Per-role smoke check before shipping RBAC-touching changes

Any change that touches feature flags, permission gates, or sidebar /
command-palette visibility logic must be verified against **all 6 default
roles**, not just `org_admin`. Demo creds in `References/KEY.md`. The fast
loop:

1. `curl POST /api/v1/auth/login` for each role → grab JWT.
2. `curl GET` the headline endpoints (feature-flags + the `/me` endpoints
   for each module) and capture status codes.
3. If any non-admin role gets a different visibility outcome than admin,
   stop and treat it as a bug.

Skip the Playwright sweep for known-good RBAC changes; use it when the
fix touches sidebar / command-palette wiring directly (where the broken
state has to be seen, not just measured at the API).

### 3.17 Module-key matching contract (added v1.4.3)

Every place the **frontend** declares a `module:` key — `NavItem.module`
in `apps/web/src/components/shell/sidebar-nav.ts` and the `module:` field
on each `PAGES` entry in `CommandPalette.tsx` — **must** be a key that
exists in the backend feature-flag registry
(`apps/api/common/feature_flags/registry.py`: `TOGGLABLE_MODULES`,
`CRITICAL_MODULES`, or `DERIVED_MODULES`).

The key must also match the **backend's `@requires_feature("X")`** for the
viewset(s) that the route's page hits. Example: `/payroll/admin` calls
`PayrollPeriodViewSet` and `PayrollRunViewSet`, both gated by
`@requires_feature("payslip")` — so the sidebar item must declare
`module: "payslip"`, not `"payroll"`.

**Why the typo is silent.** `useFeature(key)` in
`apps/web/src/lib/feature-flags.tsx` returns `true` for keys not present
in the loaded flags map — by design, so newly added flags don't
blank-screen the UI before the registry catches up. A typoed or unmapped
key falls into this "unknown = enabled" bucket and bypasses the gate.

**Checklist when adding or moving a module:**

1. Update `registry.py` if a new flag is genuinely needed.
2. Update *every* nav source: `sidebar-nav.ts`, `CommandPalette.tsx`,
   any other place that calls `useFeature(...)`.
3. Update the backend `@requires_feature("...")` if the module key is
   changing.
4. Add a `Sidebar.test.tsx` regression that asserts the link is hidden
   when the flag is `false` (cf. the v1.4.3 Payroll regression tests).
5. Run a **5-role Playwright sweep** before shipping (see §3.16). Don't
   stop early.

### 3.18 Memory hygiene

- Auto-memory lives at `~/.claude/projects/-home-universal-Claude-HR-Management/memory/`.
- After every release, update `hrms_milestone_progress.md` (current tag, tag count, test counts, headline scope).
- If a memory note disagrees with git or with current code, trust git/code and fix the memory.

## 4. Pointers

- Specs — `docs/superpowers/specs/` (committed only when ancient — `docs/` is gitignored as of commit `3766194`; new specs and plans live there as session-local scratch unless you copy them somewhere tracked)
- Plans — `docs/superpowers/plans/` (same gitignore note)
- Audits — `docs/audits/` (system-state, ui-quality, bug-followup, module-visibility) — gitignored, but they're the durable record of investigation work between sessions on this machine. The CHANGELOG entry is the user-facing record; the audit doc is the post-mortem
- Runbooks — `docs/runbooks/` (deploy, rollback, restore, key rotation, ledger verify, monitoring, parallel run) — also gitignored
- Design references — `References/Design/`, `References/Schdedules_Design/` (gitignored, local-only)
- Ops references — `References/KEY.md` (demo creds), `References/Pormpt_tostart.md` (note the typo — that's the actual filename), `References/Prompt_*.md` (one-shot agent prompts)
- Memory index — `~/.claude/projects/-home-universal-Claude-HR-Management/memory/MEMORY.md`
- Changelog — `CHANGELOG.md`
- Make targets — `make help` (dev, test, migrate, contracts, lint, build, seed-provintell, verify-backup)
- One-command boot after PC restart — `./start.sh`

## 5. When in doubt

- **Git is authoritative.** If a doc disagrees with `git tag --list` or `git log`, trust git and fix the doc.
- **Memory may be stale.** Verify before quoting it (the auto-memory system marks stale entries; treat them as hypotheses, not facts).
- **Ambiguous request → one tight clarifying question.** Don't guess scope or invent requirements.
- **Risky / destructive action → confirm before executing.** The cost of asking is tiny; the cost of a wrong action is large.
- **Skill applies → invoke it before any other action.** Brainstorm before designing; plan before coding; verify before claiming done.
- **No unrequested scope.** A bug fix doesn't need a refactor; a one-shot doesn't need a helper. Three similar lines beats a premature abstraction.
