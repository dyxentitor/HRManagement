# HRMS Admin Tools (v1.3.0) — Roadmap

**Spec:** `docs/superpowers/specs/2026-04-30-hrms-admin-tools.md`
**Goal:** Three admin tools so `org_admin` can configure the system from the UI: per-user role assignment, per-role permission editor, per-org module on/off feature flags. Ships as `v1.3.0`.

This roadmap splits the implementation into 4 sub-plans. Each one ends in a shippable, testable state. Stop after any sub-plan and the system still works.

---

## Sub-plan order

| # | Sub-plan | File | Approx. tasks |
|---|----------|------|---------------|
| A | Foundation + role admin backend | `2026-04-30-hrms-admin-A-backend-roles.md` | 11 |
| B | Feature flags backend | `2026-04-30-hrms-admin-B-backend-flags.md` | 8 |
| C | Frontend admin pages | `2026-04-30-hrms-admin-C-frontend.md` | 8 |
| D | Polish + tag `v1.3.0` | `2026-04-30-hrms-admin-D-polish.md` | 3 |

Total: ~30 tasks, ~14-18 hours sequential subagent work.

---

## Sub-plan A — Foundation + role admin backend (batches 1, 2, 3)

**Goal:** all backend infrastructure for Features 1 and 2. Admin can list/get/PATCH role permissions, reset to defaults, and assign roles to users — all via curl. No UI yet.

After A: backend test count rises from 468 → ~490; new endpoints documented in OpenAPI; old `seed_default_roles` no longer wipes admin edits.

Tasks:
1. Add `org:feature_flag:read` and `org:feature_flag:write` to permission catalogue fixture.
2. Grant the two new perms to `org_admin` in `default_roles.yaml`.
3. Switch `seed_default_roles` to "create-if-absent" semantics + regression test.
4. Add `assign_roles_to_user` service helper with self-demote + last-admin guards.
5. Add `set_role_permissions` service helper with `org_admin`-keeps-perms guard + last-`*:write`-holder guard.
6. Add `reset_role_to_defaults` service helper.
7. `RoleViewSet` (list/retrieve) + `role_permissions_view` (PATCH) + `role_reset_view` (POST).
8. `assign_user_roles_view` (PATCH `/users/{id}/roles/`).
9. `RoleDetailSerializer` + `AssignRolesInputSerializer` + `RolePermissionsInputSerializer`.
10. URL wiring + permission gates.
11. Audit-log integration tests (5 entry types).

---

## Sub-plan B — Feature flags backend (batches 4, 5)

**Goal:** the new `common/feature_flags/` subpackage exists; `@requires_feature` decorator wired on all 10 togglable ViewSets; `/api/v1/org/feature-flags/` endpoints work.

After B: backend test count ~510; each module's API endpoints return 403 when its flag is disabled (no UI yet but verifiable via curl).

Tasks:
1. New Django app `common.feature_flags` with `models.py` (FeatureFlag), migration, registry constants.
2. `services.py` — `is_enabled` (with dependency cascade) + `_is_own_enabled` (cache layer) + `set_enabled` (with critical-module guard) + `list_for_org`.
3. `cache.py` — Redis 60s TTL helpers, key format `ff:{org_id}:{key}`.
4. `decorators.py` — `@requires_feature(key)` class decorator that wraps `dispatch()` and short-circuits to 403.
5. `views.py` + `urls.py` — `feature_flags_list_view` and `feature_flag_patch_view`.
6. Audit-log integration on `set_enabled` (writes `feature_flag.changed`).
7. Apply `@requires_feature` to all 10 togglable ViewSets (Leave, Schedule, Attendance, Claims, Payslip, KPI, Cert, Training, Reports, Notifications).
8. End-to-end test: disable a module via the PATCH endpoint, verify the module's endpoints 403, re-enable, verify recovery.

---

## Sub-plan C — Frontend admin pages (batches 6, 7, 8)

**Goal:** three admin pages live, RolesCard embedded on EmployeeDetail, FeaturesProvider gates sidebar + ⌘K.

After C: full feature is usable end-to-end; frontend test count ~108.

Tasks:
1. `apps/web/src/modules/admin/api.ts` — `roleApi`, `userRolesApi`, `featureFlagApi` typed clients.
2. `AdminRolesPage.tsx` — list 7 roles via DataTable; route `/admin/roles`.
3. `AdminRoleDetailPage.tsx` — permission matrix grouped by module + sticky save bar + reset-to-defaults two-step + Users card; route `/admin/roles/:code`.
4. `RolesCard.tsx` (in `modules/admin/components/`) — embedded card with edit dialog.
5. Extend `EmployeeDetailPage.tsx` to render `<RolesCard>` when current user has `role:write`.
6. `FeaturesProvider` + `useFeature(key)` hook in `apps/web/src/lib/feature-flags.tsx`.
7. `AdminModulesPage.tsx` — toggles for 10 togglable + Required pills for 3 critical + read-only for 2 derived; route `/admin/modules`.
8. Sidebar + CommandPalette gating via `useFeature`; sidebar nav additions for Admin → Roles + Modules.

---

## Sub-plan D — Polish + tag

**Goal:** ship `v1.3.0` clean.

Tasks:
1. Manual smoke against the 8-step list in spec §6 + capture audit log row counts.
2. CHANGELOG `[1.3.0]` entry + version bumps in `apps/web/package.json`, `apps/api/pyproject.toml`, `SPECTACULAR_SETTINGS["VERSION"]`. Memory updated.
3. `git tag -a v1.3.0` + push.

---

## Acceptance (matches spec §6)

- Backend tests ≥ 496 / frontend ≥ 108
- All 8 manual smoke steps in spec §6 pass
- `pytest`, `pnpm typecheck`, `pnpm test`, `pnpm run build` all green
- New permission codes seeded (`org:feature_flag:read`, `org:feature_flag:write`)
- Audit log shows ≥ 5 entries from the smoke
- `CHANGELOG.md` `[1.3.0]` entry, all three version markers bumped
- Tag `v1.3.0` on master

---

## Convention

- Branch: `admin-tools/<sub-plan-letter>` per sub-plan (or single `admin-tools` branch if doing them in sequence — matches v1.1.0/v1.2.0 pattern).
- Commit messages follow `feat(admin)`, `chore(admin)`, `test(admin)` prefixes.
- After each sub-plan: `pytest`, `pnpm typecheck`, `pnpm test`, `pnpm run build` all green.
- Single tag at the end of sub-plan D only.
