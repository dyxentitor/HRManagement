# HRMS Admin Tools — Design Spec

**Status:** Approved 2026-04-30 · ready for implementation planning
**Target release:** `v1.3.0` (single milestone)
**Scope:** Three admin tools so `org_admin` can configure the system from the UI without re-running seed scripts: per-user role assignment, per-role permission editor, and per-org module on/off feature flags.

Spec references the existing v1.2.0 codebase. All locked decisions (5 questions in brainstorming) and chosen approach (Hybrid C — backend close to domain, frontend in `modules/admin/`) are recorded inline.

---

## 0. Locked decisions (from brainstorming)

| # | Decision | Lock |
|---|---|---|
| 1 | Scope | All three features in one milestone (v1.3.0). |
| 2 | Custom roles | Edit existing 7 seeded roles only. No `POST /roles/`, no `DELETE /roles/`. Add a "Reset to defaults" button per role instead. |
| 3 | Module-disabled UX | Hide the disabled module everywhere — sidebar nav, ⌘K palette, dashboard cards, approvals filter pills. API endpoints return 403. Existing data stays in DB; re-enabling makes it visible again. |
| 4 | Role-change propagation | User's session stays valid. Their next `/auth/me` refresh picks up new perms. Force-logout is NOT triggered. |
| 5 | Seed re-run behaviour | `seed_default_roles` becomes "create roles if absent; never modify existing rows". Admin edits stick across re-runs. The "Reset to defaults" button is the manual escape hatch. |
| 6 | Architecture | Hybrid C — backend logic stays close to its domain (roles in `modules/identity/`, flags in new `common/feature_flags/`). Frontend gets a single `modules/admin/` home for the three new pages. The Roles card on `/employees/{id}` stays in-context. |

---

## 1. Architecture & module map

### Backend — what's new vs extended

| Layer | Path | New? | Purpose |
|---|---|---|---|
| Endpoints | `apps/api/modules/identity/views.py` | extended | `RoleViewSet` (list/get/PATCH); `assign_user_roles_view` |
| Serializers | `apps/api/modules/identity/serializers.py` | extended | `RoleDetailSerializer`, `AssignRolesInputSerializer` |
| Services | `apps/api/modules/identity/services/permissions.py` | extended | `assign_roles_to_user(actor, target, role_codes)`; `set_role_permissions(actor, role_code, permission_codes)`; `reset_role_to_defaults(actor, role_code)` |
| Models | `apps/api/common/feature_flags/models.py` | **new** | `FeatureFlag` |
| Registry | `apps/api/common/feature_flags/registry.py` | **new** | `TOGGLABLE_MODULES`, `CRITICAL_MODULES`, `DERIVED_MODULES` constants |
| Service | `apps/api/common/feature_flags/services.py` | **new** | `is_enabled(org_id, key)`; `set_enabled(org_id, key, enabled, *, actor)`; `list_for_org(org_id)` |
| Cache | `apps/api/common/feature_flags/cache.py` | **new** | Redis 60s TTL helpers |
| Decorator | `apps/api/common/feature_flags/decorators.py` | **new** | `@requires_feature(key)` class decorator for ViewSets |
| Endpoints | `apps/api/common/feature_flags/views.py` | **new** | `feature_flags_list_view`, `feature_flag_patch_view` |
| URLs | `apps/api/common/feature_flags/urls.py` | **new** | `/api/v1/org/feature-flags/` routes |
| Migration | `apps/api/common/feature_flags/migrations/0001_initial.py` | **new** | `feature_flags` table |
| Decorator wiring | each module's `views.py` (Leave, Schedule, Attendance, Claims, Payslip, KPI, Cert, Training, Reports, Notifications) | extended | `@requires_feature("<key>")` on each ViewSet |
| Permission catalogue | `apps/api/modules/identity/fixtures/permissions_m1b.yaml` | extended | Add `org:feature_flag:read`, `org:feature_flag:write` |
| Default roles | `apps/api/modules/identity/fixtures/default_roles.yaml` | extended | Grant the two new perms to `org_admin` |
| Seed command | `apps/api/modules/identity/management/commands/seed_default_roles.py` | extended | Switch from "sync to fixture exactly" to "create-if-absent". |

### Frontend — single admin home + embedded Roles card

| Path | New? | Purpose |
|---|---|---|
| `apps/web/src/modules/admin/pages/AdminRolesPage.tsx` | new | `/admin/roles` — list 7 roles |
| `apps/web/src/modules/admin/pages/AdminRoleDetailPage.tsx` | new | `/admin/roles/{code}` — permission matrix + reset + users |
| `apps/web/src/modules/admin/pages/AdminModulesPage.tsx` | new | `/admin/modules` — module toggles |
| `apps/web/src/modules/admin/api.ts` | new | `roleApi.list/get/patchPermissions/resetDefaults`; `userRolesApi.assign`; `featureFlagApi.list/patch` |
| `apps/web/src/modules/admin/routes.tsx` | new | The three routes above |
| `apps/web/src/modules/admin/components/RolesCard.tsx` | new | Embedded card used by `EmployeeDetailPage` |
| `apps/web/src/modules/employee/pages/EmployeeDetailPage.tsx` | extended | Renders `<RolesCard>` when current user has `role:write` |
| `apps/web/src/lib/feature-flags.tsx` | new | `<FeaturesProvider>` + `useFeature()` hook |
| `apps/web/src/components/shell/Sidebar.tsx` | extended | Hide nav items via `useFeature` |
| `apps/web/src/components/shell/CommandPalette.tsx` | extended | Same gating |
| `apps/web/src/components/shell/sidebar-nav.ts` | extended | Two new Admin items: Roles (`/admin/roles`, `role:write`) and Modules (`/admin/modules`, `org:feature_flag:write`) |

### Permission codes

Reuse existing where possible:

| Code | Status | Used by |
|---|---|---|
| `role:read` | exists | List/get role endpoints |
| `role:write` | exists | PATCH role permissions (Feature 2) AND assign roles to users (Feature 1). Single perm covers both. |
| `org:feature_flag:read` | **new** | GET `/org/feature-flags/` |
| `org:feature_flag:write` | **new** | PATCH `/org/feature-flags/{key}/` |

`org_admin` gets all four. No other role gets the `feature_flag:*` perms by default.

### Module-key registry

15 entries total: 10 togglable, 3 critical, 2 derived. The frontend `<FeaturesProvider>` and the backend `@requires_feature` decorator share this list as the single source of truth (exposed via `GET /api/v1/org/feature-flags/`).

| Key | Class | Notes |
|---|---|---|
| `identity` | **critical** | Disabling = total lockout. Always True. |
| `employee` | **critical** | Every page reads employee data. |
| `organization` | **critical** | Org settings live here. |
| `leave` | togglable | — |
| `schedule` | togglable | — |
| `attendance` | togglable | `depends_on=["schedule"]` — disabling schedule auto-disables attendance |
| `claims` | togglable | — |
| `payslip` | togglable | — |
| `kpi` | togglable | — |
| `certification` | togglable | — |
| `training` | togglable | `depends_on=["certification"]` |
| `reports` | togglable | — |
| `notifications` | togglable | — |
| `dashboard` | derived | enabled iff at least one of: leave, schedule, attendance, claims, kpi, certification |
| `approvals` | derived | enabled iff at least one of: leave, claims, kpi |

10 admin-togglable, 3 critical (always-on), 2 derived (computed read-only).

---

## 2. Feature 1 — Per-user role assignment

### Endpoint

`PATCH /api/v1/users/{user_id}/roles/`

**Permission:** `role:write`

**Request body:**
```json
{ "role_codes": ["manager", "team_lead"] }
```

Replace semantics. Empty array allowed (= remove all roles).

**Success response (200):**
```json
{
  "user_id": "...",
  "email": "...",
  "role_codes": ["manager", "team_lead"],
  "permissions": ["leave:request:create:self", "approvals:inbox:read", "..."]
}
```

The new effective permission set is returned so the frontend can verify and refresh state.

**Validation errors (400):**
- Unknown role code: `{"detail": "Unknown role code: <code>"}`
- Self-demotion (Section 5): `{"detail": "You can't remove your own org_admin role. Ask another admin first."}`
- Last-admin guard (Section 5): `{"detail": "At least one user in this organisation must be an org_admin. Grant the role to someone else first."}`

**Other errors:**
- Target user not found: 404
- Caller lacks `role:write`: 403

**Audit:**
- One `user.role_granted` row per code added; one `user.role_revoked` per code removed. Actor = caller, subject = target user, payload = `{role_code: "..."}`. Idempotent calls (same set in) write zero audit rows.

### Frontend — `<RolesCard>` on `/employees/{id}`

Visible only when current user has `role:write`. Renders the target user's current role labels as `<StatusPill>`s. "Edit roles" button opens a `<Dialog>` with a checkbox list of all 7 org roles loaded via `GET /api/v1/roles/`. Save calls the PATCH; toast on success: "Roles updated for {full_name}".

If the target Employee has no linked User account (`user_id is null`), show: "No login account — assign roles after the user signs in for the first time" with the editor disabled.

The frontend doesn't force-reload the target user's session — per locked decision Q4, their `/auth/me` refresh picks it up.

---

## 3. Feature 2 — Per-role permission matrix

### Endpoints

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/roles/` | `role:read` | List 7 roles + per-role permission count + user count |
| `GET` | `/api/v1/roles/{code}/` | `role:read` | Single role + full `permission_codes[]` |
| `PATCH` | `/api/v1/roles/{code}/permissions/` | `role:write` | Replace the role's `permission_codes[]` |
| `POST` | `/api/v1/roles/{code}/reset-to-defaults/` | `role:write` | Re-apply the fixture's defaults for that role |

No `POST /roles/` and no `DELETE /roles/{code}/` — system roles aren't creatable or deletable from the UI (locked Q2).

### PATCH semantics

Request:
```json
{ "permission_codes": ["leave:request:create:self", "leave:request:approve:team", "..."] }
```

Replace: server diffs against current and applies adds + removes.

### Validation guards (refuse with 400)

1. **`org_admin` always keeps the admin perms.** PATCH on `/roles/org_admin/permissions/` cannot remove any of: `role:read`, `role:write`, `org:feature_flag:read`, `org:feature_flag:write`, or any `identity:*` permission. Error: `{"detail": "org_admin must retain identity admin perms"}`.

2. **At least one role must hold each `*:write` and `*:approve` permission.** If the change would leave **zero** roles holding (say) `payroll:run:create`, refuse: `{"detail": "This change would leave nobody able to <perm>. Grant <perm> to another role first."}`. Read-only perms (`*:read:*`) are exempt — admin may legitimately grant nobody the ability to read something.

3. **Unknown permission code** in `permission_codes[]`: `{"detail": "Unknown permission code: <code>"}`.

### Reset to defaults

`POST /api/v1/roles/{code}/reset-to-defaults/` reads `apps/api/modules/identity/fixtures/default_roles.yaml` at request time and applies the fixture's perms for that role. Two-step confirm in the UI.

The fixture remains the single source of truth for defaults — if it's updated in a future release, the reset endpoint picks up the new defaults.

### Audit

- One `role.permissions_changed` row per PATCH with `{added: [...], removed: [...]}` payload. Actor = caller, subject = role.
- One `role.reset_to_defaults` row per reset call with `{permissions_after: [...]}` payload.

### Frontend

**`/admin/roles`** — DataTable with columns Name | Type pill (System) | Perms count | Users count | →

Row click → `/admin/roles/{code}`.

**`/admin/roles/{code}`** — three cards stacked, matching the `MyProfilePage` chrome:

1. **General** — name, code (read-only), description, `[System]` pill
2. **Permissions** — matrix grouped by module heading. Per-permission checkbox; per-module "toggle all" master checkbox. Locked perms (Section 5 rule 1) render as `checked + disabled` with tooltip "Required for org_admin". Sticky save bar appears on dirty: "[N] changes — Save". "Reset to defaults" button at the bottom right (two-step confirm).
3. **Users** — list of users currently holding this role with link to `/employees/{id}`. Read-only.

---

## 4. Feature 3 — Per-org module on/off (feature flags)

### Schema

```python
# apps/api/common/feature_flags/models.py
class FeatureFlag(models.Model):
    id          = UUIDField(primary_key=True, default=uuid4)
    org_id      = UUIDField(db_index=True)
    key         = CharField(max_length=64)
    enabled     = BooleanField(default=True)
    updated_at  = DateTimeField(auto_now=True)
    updated_by  = ForeignKey("identity.User", null=True, on_delete=SET_NULL)

    class Meta:
        db_table = "feature_flags"
        unique_together = [("org_id", "key")]
        indexes = [Index(fields=["org_id", "key"])]
```

### Registry (single source of truth)

```python
# apps/api/common/feature_flags/registry.py
TOGGLABLE_MODULES: dict[str, dict] = {
    "leave":         {"label": "Leave", "depends_on": []},
    "schedule":      {"label": "Schedule", "depends_on": []},
    "attendance":    {"label": "Attendance", "depends_on": ["schedule"]},
    "claims":        {"label": "Claims", "depends_on": []},
    "payslip":       {"label": "Payslips", "depends_on": []},
    "kpi":           {"label": "KPI", "depends_on": []},
    "certification": {"label": "Certifications", "depends_on": []},
    "training":      {"label": "Training", "depends_on": ["certification"]},
    "reports":       {"label": "Reports", "depends_on": []},
    "notifications": {"label": "Notifications", "depends_on": []},
}
CRITICAL_MODULES: set[str] = {"identity", "employee", "organization"}
DERIVED_MODULES: dict[str, dict] = {
    "dashboard": {"depends_on_any": ["leave","schedule","attendance","claims","kpi","certification"]},
    "approvals": {"depends_on_any": ["leave","claims","kpi"]},
}
```

### Service

```python
# apps/api/common/feature_flags/services.py
def is_enabled(org_id: UUID, key: str) -> bool:
    """Effective state — checks own row AND all `depends_on` ancestors.

    Returns False if any dependency is disabled, even if this module's row
    says enabled=True. Critical modules always return True.
    """
    if key in CRITICAL_MODULES:
        return True
    # Check this module's own row (cached)
    own = _is_own_enabled(org_id, key)
    if not own:
        return False
    # Check dependencies (cascade — schedule off => attendance off)
    for dep_key in TOGGLABLE_MODULES.get(key, {}).get("depends_on", []):
        if not is_enabled(org_id, dep_key):
            return False
    return True

def _is_own_enabled(org_id: UUID, key: str) -> bool:
    cached = redis_client.get(f"ff:{org_id}:{key}")
    if cached is not None:
        return cached == b"1"
    flag = FeatureFlag.objects.filter(org_id=org_id, key=key).first()
    enabled = flag.enabled if flag else True   # default-enabled when row absent
    redis_client.setex(f"ff:{org_id}:{key}", 60, b"1" if enabled else b"0")
    return enabled

def set_enabled(org_id: UUID, key: str, enabled: bool, *, actor) -> FeatureFlag:
    if key in CRITICAL_MODULES and not enabled:
        raise CriticalModuleError(key)
    if key not in TOGGLABLE_MODULES and key not in DERIVED_MODULES:
        raise UnknownModuleKey(key)
    flag, _ = FeatureFlag.objects.update_or_create(
        org_id=org_id, key=key,
        defaults={"enabled": enabled, "updated_by": actor},
    )
    redis_client.delete(f"ff:{org_id}:{key}")
    audit.append("feature_flag.changed", actor=actor, payload={
        "key": key, "enabled": enabled,
    })
    return flag

def list_for_org(org_id: UUID) -> list[dict]:
    """Returns the registry data joined with current FeatureFlag rows."""
    ...
```

### Decorator

```python
# apps/api/common/feature_flags/decorators.py
def requires_feature(key: str):
    """Class decorator for DRF ViewSets."""
    def wrap(cls):
        original_dispatch = cls.dispatch
        def dispatch(self, request, *args, **kwargs):
            if not is_enabled(request.user.org_id, key):
                return Response(
                    {"detail": f"Module '{key}' is disabled for this organisation"},
                    status=403,
                )
            return original_dispatch(self, request, *args, **kwargs)
        cls.dispatch = dispatch
        return cls
    return wrap
```

The decorator runs **before** `HRMSPermission` because dispatch wraps the whole DRF chain. So a disabled module returns 403 even for users who would normally have permission.

Critical-modules short-circuit happens inside `is_enabled` (returns True regardless of DB state), so even a manual `UPDATE feature_flags SET enabled=false WHERE key='identity'` can't lock anyone out.

### Endpoints

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/org/feature-flags/` | `org:feature_flag:read` | List all 15 entries (10 togglable + 3 critical + 2 derived) with their effective state |
| `PATCH` | `/api/v1/org/feature-flags/{key}/` | `org:feature_flag:write` | `{enabled: bool}` — set state. 400 on critical, 400 on unknown key |

`GET` response shape:
```json
[
  {"key": "leave", "label": "Leave", "enabled": true,  "togglable": true,  "critical": false, "derived": false, "depends_on": []},
  {"key": "attendance", "label": "Attendance", "enabled": true, "togglable": true, "critical": false, "derived": false, "depends_on": ["schedule"]},
  {"key": "identity", "label": "Identity", "enabled": true, "togglable": false, "critical": true, "derived": false, "depends_on": []},
  {"key": "dashboard", "label": "Dashboard", "enabled": true, "togglable": false, "critical": false, "derived": true, "depends_on_any": ["leave","schedule","attendance","claims","kpi","certification"]}
]
```

### Decorator wiring (per ViewSet)

| ViewSet | Decorator |
|---|---|
| `LeaveTypeViewSet`, `LeaveBalanceViewSet`, `LeaveRequestViewSet` | `@requires_feature("leave")` |
| `ScheduleViewSet`, `ShiftViewSet`, `WorkScheduleViewSet`, `ShiftAssignmentViewSet`, `HolidayViewSet` | `@requires_feature("schedule")` |
| `AttendanceViewSet` | `@requires_feature("attendance")` |
| `ClaimRequestViewSet`, `ClaimCategoryViewSet`, `ClaimPolicyViewSet` | `@requires_feature("claims")` |
| `PayslipViewSet`, `PayrollPeriodViewSet`, `PayrollRunViewSet` | `@requires_feature("payslip")` |
| `KpiTemplateViewSet`, `KpiCycleViewSet`, `KpiAssignmentViewSet`, `KpiReviewViewSet` | `@requires_feature("kpi")` |
| `CertificationViewSet` | `@requires_feature("certification")` |
| `TrainingPlanViewSet`, `TrainingAssignmentViewSet` | `@requires_feature("training")` |
| `ReportViewSet`, `SavedViewViewSet`, `ReportExportJobViewSet` | `@requires_feature("reports")` |
| `NotificationViewSet`, `NotificationPreferenceViewSet`, `EmailDigestRunViewSet` | `@requires_feature("notifications")` |
| Identity, Employee, Organization, Dashboard, Approvals, Auth ViewSets | NOT decorated — critical or derived |

### Frontend — `/admin/modules`

Single page, three card-groups stacked:

1. **Togglable section** — 10 cards. Each card:
   - Module label (large) + 1-line description ("Leave requests, balances, and approvals")
   - Status pill: `Enabled` (mint) or `Disabled` (coral)
   - shadcn `<Switch>` — auto-saves on change with toast "Module {label} {enabled|disabled}"
   - Small text "Affects: 3 pages, 8 endpoints"

2. **Critical section** (collapsed by default) — 3 cards. Switch is `disabled` + `Required` pill (lavender). Tooltip "This module is required for the system to function."

3. **Derived section** — 2 cards (Dashboard, Approvals). Read-only state. Caption: "Auto-enabled when at least one of: …"

### `<FeaturesProvider>` + `useFeature(key)` hook

Mounted high in the React tree (under `<AuthProvider>`). On signin/page-load, fetches `/api/v1/org/feature-flags/` once and caches the boolean map in context. Refreshes every 60s in the background.

```ts
// apps/web/src/lib/feature-flags.tsx
export function useFeature() {
    const { isEnabled } = useContext(FeaturesContext);
    return { isEnabled };
}

// usage
const { isEnabled } = useFeature();
if (!isEnabled("claims")) return null;
```

Sidebar uses this in addition to `useCan(perm)` — a nav item is visible iff BOTH the user has the perm AND the module is enabled. `<CommandPalette>` follows the same rule.

### Backwards-compatibility

If no `FeatureFlag` row exists for a key, `is_enabled` returns `True`. Existing orgs (Provintell) need ZERO migration data — the migration only creates the empty table. Disabled state is opt-in, written only when admin toggles a module off.

---

## 5. Cross-cutting concerns

### Lockout protection

Three rules enforced at the **service layer** so curl, Django admin, and the UI all hit them:

1. **Self org_admin removal.** `assign_roles_to_user(actor, target, role_codes)` raises `SelfDemoteError` (→ 400) when:
   ```
   actor.id == target.id
   AND "org_admin" not in role_codes
   AND target currently holds "org_admin"
   ```

2. **Last org_admin in the org.** Raises `LastAdminError` (→ 400) when removing `org_admin` from anyone (including but not limited to self) would leave the org with **zero** users holding `org_admin`.

3. **Critical perms on org_admin role.** `set_role_permissions(actor, "org_admin", new_codes)` rejects when the result would remove any of: `role:read`, `role:write`, `org:feature_flag:read`, `org:feature_flag:write`, or any `identity:*` permission.

### Audit log entries

| Action key | Subject ref | Payload |
|---|---|---|
| `user.role_granted` | target user | `{role_code: "manager"}` |
| `user.role_revoked` | target user | `{role_code: "manager"}` |
| `role.permissions_changed` | role.code | `{added: [...], removed: [...]}` |
| `role.reset_to_defaults` | role.code | `{permissions_after: [...]}` |
| `feature_flag.changed` | (org-wide) | `{key, enabled, prev}` |

`actor_id` captured by existing `AuditContextMiddleware`.

### Critical modules — defense in depth

Three layers, each independent:

1. **Frontend** — `/admin/modules` page renders critical toggles as `disabled` with `Required` pill.
2. **API** — `set_enabled()` raises `CriticalModuleError` → 400 with `{"detail": "Cannot disable critical module 'identity'"}`.
3. **Decorator** — `is_enabled()` returns `True` for critical keys regardless of DB state.

Even a manual `UPDATE feature_flags SET enabled=false WHERE key='identity'` cannot lock the system out.

### Cache invalidation guarantees

When `set_enabled()` flips a flag:
- Redis key `ff:{org_id}:{key}` is `DEL`d immediately, before the response returns
- Next request to any endpoint reads fresh from DB on cache miss + warms cache for 60 s
- Frontend `<FeaturesProvider>` polls every 60 s, so users see the change within a minute even without a page refresh
- The admin who toggled gets immediate confirmation via the toast

### Reset-to-defaults source

`apps/api/modules/identity/fixtures/default_roles.yaml` remains the single source of truth for what each role's default permission set is. The reset endpoint reads it at request time, so fixture updates in future releases automatically become the new defaults.

### `seed_default_roles` re-run behaviour change

Currently the seed SYNCS to the fixture exactly (drops missing perms, adds extras). For v1.3.0 the seed becomes "create-if-absent":

```python
# in seed_default_roles.py — pseudocode
for entry in fixture:
    role, created = Role.objects.get_or_create(
        org_id=org.id, code=entry["code"],
        defaults={"name": entry["name"], "description": ..., "is_system": True},
    )
    if created:
        # only seed permissions for brand-new roles
        RolePermission.objects.bulk_create([...])
    # if not created, do nothing — admin's edits are sacred
```

The "Reset to defaults" UI button is the explicit opt-in for re-applying defaults.

---

## 6. Testing strategy & acceptance

### Backend tests (target: +28 over 468 baseline = 496+)

| File | New tests | Coverage |
|---|---|---|
| `modules/identity/tests/test_roles_admin.py` (new) | 10 | List/get role; PATCH happy path; PATCH unknown perm code → 400; PATCH org_admin removing identity perm → 400; PATCH leaves zero `*:write` holder → 400; reset-to-defaults; permission gate (employee can't PATCH → 403); audit row written on PATCH; idempotent PATCH (same set in, no audit row); reset writes audit |
| `modules/identity/tests/test_user_roles_admin.py` (new) | 8 | Assign roles happy path; assign unknown role code → 400; self-demote from org_admin → 400; last-org_admin guard → 400; assign to user without User account → 404; permission gate; two audit rows (granted + revoked); idempotency |
| `common/feature_flags/tests/test_services.py` (new) | 6 | `is_enabled` defaults to True when no row; respects DB row; critical modules always True even if DB says False; cache hit/miss; `set_enabled` writes audit; critical module rejection |
| `common/feature_flags/tests/test_decorator.py` (new) | 4 | Decorator blocks disabled module → 403; decorator passes when enabled; decorator passes for critical even if DB says False; decorator runs before perm check |

### Frontend tests (target: +9 over 99 baseline = 108+)

| File | New tests | Coverage |
|---|---|---|
| `modules/admin/pages/AdminRolesPage.test.tsx` (new) | 2 | Renders 7 rows; row click navigates |
| `modules/admin/pages/AdminRoleDetailPage.test.tsx` (new) | 4 | Renders matrix grouped by module; sticky save bar appears on dirty; reset-to-defaults two-step confirm; locked perms checkbox is disabled |
| `modules/admin/pages/AdminModulesPage.test.tsx` (new) | 3 | Renders togglable + critical sections; switch calls API; critical switch is disabled |
| `modules/employee/pages/EmployeeDetailPage.test.tsx` (extend) | +1 | Roles card renders + Edit dialog opens (visible only with `role:write`) |

### Manual smoke (after the build, sign in as `admin@provintell.demo`)

1. `/admin/roles` → 7 rows render with permission counts and user counts. Click `team_lead` → matrix loads, no perms = 0 selected.
2. Toggle `team_lead` to grant `claim:approve:team`, save → toast confirms; sign in as `eng.lead@provintell.demo` (manager + team_lead) → `/approvals` → can approve a claim.
3. Try to PATCH `org_admin` removing `role:write` via curl → 400.
4. As admin, try to remove your own `org_admin` role from `/employees/{your-id}` Roles card → 400 with friendly message.
5. As admin, `/admin/modules` → toggle Claims off → toast → sidebar Claims item disappears within ~5 s, ⌘K filters Claims pages out, navigate to `/claims/me` → 403 page.
6. As admin, try to toggle Identity off (UI shouldn't let you) → backend curl test → 400.
7. Toggle Claims back on → access restored, all 20 demo claims still there.
8. Run `seed_default_roles` again after step 2 → `team_lead` still has `claim:approve:team` (preserve, not reset).

### Acceptance summary

- Backend tests ≥ 496 / frontend ≥ 108
- All 8 manual smoke steps pass
- `pytest`, `pnpm typecheck`, `pnpm test`, `pnpm run build` all green
- New permission codes seeded (`org:feature_flag:read`, `org:feature_flag:write`)
- Audit log shows ≥ 5 entries from the smoke (1 perm change + 1 role assignment + 1 module toggle + reset + last-admin guard probe)
- `CHANGELOG.md` `[1.3.0]` entry, version bumps in `package.json` / `pyproject.toml` / `SPECTACULAR_SETTINGS`
- Tag `v1.3.0` on master

---

## 7. Out of scope

- **Custom-role creation** (locked Q2 — defer to a future ask if real demand emerges).
- **Force-logout on role change** (locked Q4 — the existing `/sessions/revoke-all/` covers the "remove access NOW" need).
- **Multi-org / `super_admin`** (Phase 2).
- **Per-permission grants directly to individual users** (only role-mediated grants supported; spec section 5 explicitly mandates this).
- **Plan-tier gating** (Phase 2 — feature flags are per-org boolean only; no plan/tier dimension).
- **Audit-log viewer UI** (the data is captured, but no admin page to browse it; future ask).
- **Dark/light theme toggle** (Phase 1.5; orthogonal).
- **`identity:role:assign` as a separate perm** (not added — `role:write` covers both PATCHing role permissions and assigning roles to users).

---

## 8. Implementation order (handed to writing-plans)

Suggested batching for the plan author. Each batch ends in a shippable, testable state.

1. **Permission catalogue + service-layer fixes** (foundation): add `org:feature_flag:read/write` codes; switch `seed_default_roles` to "create-if-absent"; add the three lockout-protection helpers in `permissions.py`.
2. **Role admin endpoints + tests** (Feature 2 backend): list/get/patch/reset endpoints with full test coverage.
3. **User role assignment endpoint + tests** (Feature 1 backend): PATCH `/users/{id}/roles/` with lockout guards.
4. **Feature flags subpackage** (Feature 3 backend): models, migration, registry, service, cache, decorator, endpoints + tests.
5. **Decorator wiring** (Feature 3 backend): apply `@requires_feature` to all 10 togglable ViewSets; verify 403s in tests.
6. **Frontend admin module + Roles list/detail pages** (Features 1+2 frontend): new `/admin/roles` and `/admin/roles/{code}`.
7. **Frontend Roles card embed + EmployeeDetailPage extension** (Feature 1 frontend).
8. **Frontend modules page + FeaturesProvider** (Feature 3 frontend).
9. **Sidebar + ⌘K gating + smoke + tag v1.3.0**.

---

## 9. Open questions (none)

All five clarifying questions resolved during brainstorming. No outstanding design ambiguities.

---

*End of spec. Implementation plan to follow via the writing-plans skill.*
