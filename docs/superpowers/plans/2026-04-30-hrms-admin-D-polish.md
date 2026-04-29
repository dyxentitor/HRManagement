# HRMS Admin Tools — Sub-plan D: Polish + tag v1.3.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Spec:** `docs/superpowers/specs/2026-04-30-hrms-admin-tools.md`
**Roadmap:** `docs/superpowers/plans/2026-04-30-hrms-admin-tools-roadmap.md`
**Prereq:** Sub-plans A + B + C merged.

**Goal:** Final smoke test, version bumps, and ship `v1.3.0`.

**Tech Stack:** Python + Node + git tagging.

---

## Task 1: End-to-end smoke + audit log audit

**Files:** none — verification only.

- [ ] **Step 1: Bring services up**

```bash
cd /home/universal/Claude/HR_Management
docker compose up -d postgres redis mailhog
cd apps/api
uv run python manage.py migrate
uv run python manage.py seed_default_roles
uv run python manage.py runserver 0.0.0.0:8000 &
cd ../web
pnpm dev &
```

- [ ] **Step 2: Capture audit log baseline**

```bash
docker compose exec postgres psql -U hrms hrms -c "select count(*) from audit_log;"
```

Note the count — call it `N0`.

- [ ] **Step 3: Walk through spec §6 8-step smoke**

For reference, the steps from the spec are:

1. Sign in as `cyberlab@provintell.com`.
2. Visit `/admin/roles` — confirm 7 roles listed.
3. Click `team_lead` → toggle `claim:approve:team` on → save → confirm green toast.
4. Sign out, sign in as a `team_lead` user → visit `/approvals` → confirm new claims approval permission visible (or test via curl `claim:approve:team` permission check).
5. Sign back in as admin → `/admin/modules` → toggle Claims off → save.
6. Refresh → confirm Claims hidden in sidebar + ⌘K + direct URL `/claims/me` returns a graceful 403/empty state.
7. Toggle Claims back on → refresh → confirm restored.
8. Visit `/employees/{id}` → click "Edit roles" → assign Manager → save → confirm badge.

For each step, record: **PASS / FAIL / NOTES**.

- [ ] **Step 4: Verify audit log grew**

```bash
docker compose exec postgres psql -U hrms hrms -c "select count(*) from audit_log;"
```

Expected: count is `N0 + ≥ 5` (roles set, role assigned, feature flag off, feature flag on, role assigned again at minimum).

- [ ] **Step 5: Spot-check audit log entries**

```bash
docker compose exec postgres psql -U hrms hrms -c "
  select created_at, actor_user_id, action, target_type, summary
  from audit_log
  where action in ('role.permissions.set', 'user.roles.set', 'feature_flag.changed', 'role.reset')
  order by created_at desc
  limit 10;
"
```

Expected: see entries for each smoke action.

- [ ] **Step 6: Document the smoke result**

Write a brief one-paragraph summary in the commit body for Task 2's CHANGELOG bump:

```
v1.3.0 smoke: 8/8 steps passed. Audit log grew by N entries (role.permissions.set ×1, user.roles.set ×2, feature_flag.changed ×2). No regressions in v1.2.0 features (claims, leave, KPI all still functional after toggling).
```

If any smoke step fails, halt — fix in a hotfix commit and re-run the full smoke before proceeding.

---

## Task 2: CHANGELOG entry + version bumps

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `apps/web/package.json`
- Modify: `apps/api/pyproject.toml`
- Modify: `apps/api/hrms_api/settings/base.py`

- [ ] **Step 1: Add 1.3.0 CHANGELOG entry**

Edit `CHANGELOG.md`. Replace the `## [Unreleased]` section's contents (or insert below it) with:

```markdown
## [Unreleased]

## [1.3.0] - 2026-04-30

**Admin tools — system admin can configure roles, permissions, and modules from the UI.**

### Added
- **Feature 1 — Per-user role assignment**: `org_admin` (and any role with `role:write`) can assign system roles to any user via a new "Edit roles" dialog on the Employee detail page. New endpoint `PATCH /api/v1/users/{id}/roles/`. Includes self-demote guard (cannot remove your own `role:write`) and last-admin guard (cannot strip the only `role:write` holder).
- **Feature 2 — Per-role permission editor**: new admin pages `/admin/roles` (list) and `/admin/roles/{code}` (matrix). Admin can toggle individual permissions for any of the 7 system roles, save, or reset to defaults. New endpoints `GET /api/v1/org/roles/`, `GET /api/v1/org/roles/{code}/`, `PATCH /api/v1/org/roles/{code}/permissions/`, `POST /api/v1/org/roles/{code}/reset/`. Includes guard that `org_admin` keeps `role:read` + `role:write` so admins cannot lock themselves out.
- **Feature 3 — Per-org feature flags**: new admin page `/admin/modules` with toggles for 10 togglable modules (Leave, Schedule, Attendance, Claims, Payslip, KPI, Cert, Training, Reports, Notifications). 3 critical modules (Identity, Employee, Organization) and 2 derived (Approvals, Payroll) shown as read-only. New `common.feature_flags` Django app with `FeatureFlag` model, `is_enabled` cascade service, Redis-cached lookups (60s TTL), `@requires_feature` decorator, and endpoints `GET /api/v1/org/feature-flags/` + `PATCH /api/v1/org/feature-flags/{key}/`.
- **Permissions**: new permission codes `org:feature_flag:read` and `org:feature_flag:write`, granted to `org_admin` by default.
- **Frontend**: `FeaturesProvider` + `useFeature(key)` hook gates the sidebar and ⌘K command palette. Sidebar gains a new "Roles" and "Modules" link in the Admin group.

### Changed
- `seed_default_roles` management command switches from destructive SYNC semantics to **create-if-absent**: existing roles' permission sets are preserved across deploys, so admin edits survive seeding.
- All 10 togglable ViewSets (`LeaveRequestViewSet`, `ScheduleAssignmentViewSet`, `ClockEventViewSet`, `ClaimViewSet`, `PayslipViewSet`, `KPIAssignmentViewSet`, `CertificationViewSet`, `TrainingViewSet`, `ReportViewSet`, `NotificationViewSet`) wear the `@requires_feature` decorator; disabled modules return a clear 403 with `code: "module_disabled"`.

### Backend tests
~510 (was 463). Backend test count rises from new role-admin endpoints, feature-flag service, decorator integration, and audit-log smoke tests.

### Frontend tests
~108 (was 92). Coverage added for `FeaturesProvider`, admin API client, AdminRolesPage, AdminRoleDetailPage, RolesCard, AdminModulesPage.
```

> Adjust the test counts in the entry to match the actual final numbers from `pytest --co -q | tail -1` and `pnpm vitest run | tail -3`.

- [ ] **Step 2: Bump frontend version**

Edit `apps/web/package.json`:
```diff
-  "version": "1.2.0",
+  "version": "1.3.0",
```

- [ ] **Step 3: Bump backend version**

Edit `apps/api/pyproject.toml`:
```diff
-version = "1.2.0"
+version = "1.3.0"
```

- [ ] **Step 4: Bump OpenAPI spec version**

Edit `apps/api/hrms_api/settings/base.py` line 168 area:
```diff
-    "VERSION": "1.2.0",
+    "VERSION": "1.3.0",
```

- [ ] **Step 5: Regenerate frontend OpenAPI types (so the typed admin endpoints land)**

```bash
cd /home/universal/Claude/HR_Management/apps/api
uv run python manage.py spectacular --file ../../packages/contracts/openapi.yml --validate
cd ../../packages/contracts
pnpm gen
```

> If the contracts package uses a different generator command (check `packages/contracts/package.json`), use that. The output should land in `packages/contracts/generated/`.

- [ ] **Step 6: Drop the `as never` casts in `apps/web/src/modules/admin/api.ts`**

Now that types regenerated, swap the `as never` casts in the admin client for the real path keys. Run typecheck to confirm:

```bash
cd /home/universal/Claude/HR_Management/apps/web
pnpm typecheck
```

Expected: PASS, with the now-typed `roleApi`, `userRolesApi`, `featureFlagApi` calls.

- [ ] **Step 7: Run all tests + build**

```bash
cd /home/universal/Claude/HR_Management/apps/api && uv run pytest -q
cd /home/universal/Claude/HR_Management/apps/web && pnpm vitest run && pnpm typecheck && pnpm run build
```

Expected: ALL GREEN.

- [ ] **Step 8: Update memory marker**

Update `/home/universal/.claude/projects/-home-universal-Claude-HR-Management/memory/hrms_milestone_progress.md`:

Replace the line:
```
Phase 1 COMPLETE: `v1.2.0` on master (15 tags); 463 backend + 92 frontend tests passing
```

With:
```
v1.3.0 on master (16 tags) — admin tools (role assign + permission editor + feature flags); ~510 backend + ~108 frontend tests passing
```

Adjust the index entry in `MEMORY.md` to match.

- [ ] **Step 9: Commit**

```bash
git add CHANGELOG.md \
        apps/web/package.json \
        apps/api/pyproject.toml \
        apps/api/hrms_api/settings/base.py \
        packages/contracts/openapi.yml \
        packages/contracts/generated/ \
        apps/web/src/modules/admin/api.ts
git commit -m "chore(release): v1.3.0 — admin tools

8/8 smoke passed. Audit log gains role.permissions.set, user.roles.set,
feature_flag.changed, role.reset entry types. Backend tests ~510,
frontend ~108. Memory marker updated."
```

If memory files are outside the git tree, commit just the in-repo files in this commit.

---

## Task 3: Tag and push

**Files:** none.

- [ ] **Step 1: Sanity check git status**

```bash
git status
git log --oneline -10
```

Expected: working tree clean (or only memory files outside the repo). Recent commits include the admin tool tasks.

- [ ] **Step 2: Create annotated tag**

```bash
git tag -a v1.3.0 -m "v1.3.0 — Admin tools (role assignment + permission editor + feature flags)

Three admin tools shipped behind org_admin:
- Per-user role assignment via /employees/{id} → Edit roles
- Per-role permission matrix at /admin/roles/{code}
- Per-org feature flags at /admin/modules with @requires_feature decorator
  on all 10 togglable ViewSets

New permission codes: org:feature_flag:read, org:feature_flag:write.
seed_default_roles is now non-destructive (create-if-absent).

8/8 manual smoke passed. ~510 backend + ~108 frontend tests."
```

- [ ] **Step 3: Push the tag (and master if behind remote)**

```bash
git push origin master
git push origin v1.3.0
```

> Per project convention (single-tag-per-version, on master). If the user prefers a different remote or branch, ask before pushing.

- [ ] **Step 4: Verify**

```bash
git tag --list 'v*' | tail -5
```

Expected: `v1.3.0` is the most recent tag.

---

## Acceptance for Sub-plan D (and the whole admin-tools project)

- 8/8 manual smoke steps in spec §6 pass
- Audit log gained ≥ 5 new entries from the smoke
- `pytest`, `pnpm typecheck`, `pnpm test`, `pnpm run build` all green
- `CHANGELOG.md` `[1.3.0]` entry written
- All three version markers bumped to `1.3.0`
- Tag `v1.3.0` exists on master
- Memory marker updated to reflect v1.3.0

If any criterion fails, halt and report — do NOT push the tag.
