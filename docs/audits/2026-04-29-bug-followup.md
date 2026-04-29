# Bug Follow-up Audit — 2026-04-29

Status: DONE

---

## 1. Claims POST 404

### Reproduction

```
POST /api/v1/claims/
Body: { "category": "<uuid>", "amount": "50.00", "expense_date": "2026-04-20",
        "currency_code": "MYR", "description": "test" }
```

| User | HTTP | Body |
|------|------|------|
| `admin@provintell.demo` | **404** | `{"detail":"No employee profile linked to this user."}` |
| `hr@provintell.demo` | **404** | same |
| `pvt-demo-001@provintell.local` | 201 | claim created |
| `pvt-demo-005@provintell.local` | 201 | claim created |

### Root cause

**`apps/api/modules/claims/views.py` line 134–137** (`ClaimRequestViewSet.perform_create`):

```python
def perform_create(self, serializer):
    emp = Employee.all_objects.filter(user_id=self.request.user.id).first()
    if not emp:
        raise NotFound("No employee profile linked to this user.")
    serializer.save(org_id=self.request.user.org_id, employee=emp)
```

`admin` and `hr` demo accounts have no `Employee` row. The view correctly raises
`NotFound`, which DRF serialises as HTTP 404. The frontend received 404 and
showed a toast / error string — the page rendered fine but the form action failed.

The same pattern exists in `apps/api/modules/leave/views.py` (`perform_create`
for `LeaveRequestViewSet`), confirmed with `POST /api/v1/leave/requests/` also
returning 404 for admin/hr.

Hypothesis **H1** confirmed. H2 (wrong URL) and H3 (missing perm) ruled out.

### Fix applied

**Option A** — hide the form for users without an Employee record.

- **`apps/web/src/modules/claims/pages/ClaimSubmitPage.tsx`**: on mount, calls
  `employeeApi.getMe()`. If it returns `null` (HTTP 404 on `/employees/me/`),
  sets `noEmployee = true` and renders an empty-state card instead of the form:
  _"No employee record linked — Ask HR to create your employee record first."_

- **`apps/web/src/modules/leave/pages/LeaveApplyPage.tsx`**: same gate, same
  empty-state pattern.

No backend changes required; the API already returns the correct 404 with a
human-readable detail string.

---

## 2. Color contrast violation

### Selector and measured ratio

**Element:** `DialogPrimitive.Close` button rendered inside every `DialogContent`
(including the `CommandDialog` / ⌘K command palette).

**Tailwind classes causing the violation (shadcn default, not customised):**
```
data-[state=open]:bg-accent data-[state=open]:text-muted-foreground
```

**Token resolution:**
- `bg-accent` → `accent-500` → `#7C5CFF` (rgb 124 92 255)
- `text-muted-foreground` → `text-tertiary` → `#888A93` (rgb 136 138 147)

**Contrast ratio: 1.26:1** — axe-core `serious` violation (WCAG AA requires
4.5:1 for normal text). The `sr-only` span "Close" is parsed by axe as
accessible text despite being visually hidden, so the violation fires reliably
every time a dialog or the ⌘K palette is open.

The earlier `--text-tertiary` bump from `#6E7079` → `#888A93` fixed text on
dark surfaces (ratio 3.5→5.7:1) but did **not** fix this element because
`bg-accent` is a vivid violet with similar luminance to the grey text.

### Fix applied

**`apps/web/src/components/ui/dialog.tsx` line 45**: removed
`data-[state=open]:bg-accent data-[state=open]:text-muted-foreground` from the
close button's class string.

Without those overrides the button inherits `text-foreground` (white `#FFFFFF`)
on a transparent background that blends to `bg-background` (canvas `#0B0B14`),
giving 19.6:1 — well above AA.

The `opacity-70 hover:opacity-100` base classes are preserved, so the button
still has the expected translucent-until-hovered look.

---

## 3. Other findings (read-only; not fixed)

### a. Admin Dashboard — wrong URL tested, not a bug
`GET /api/v1/dashboard/admin/` → 404 (trailing slash + wrong prefix). Correct
URL is `/api/v1/dashboards/admin` (no trailing slash, "dashboards" plural) which
returns 200. The frontend uses the correct URL. **Not a bug.**

### b. Notifications — wrong URL in test, not a bug
`GET /api/v1/notifications/` → 404. Correct URL is `/api/v1/notifications`
(no trailing slash). The frontend uses the correct URL. **Not a bug.**

### c. ⌘K employee search — 403 for non-HR users (known, by design)
`GET /api/v1/employees/?search=ops` returns 403 for `pvt-demo-001` (manager
role) because the list/search action requires `employee:read:org`, which only
admin/hr have. The `CommandPalette` already gates on `useCan("employee:read:org")`
and silently skips the request for users who lack it — so the palette is still
usable (shows pages only). **Working as intended; not a bug.**

### d. Leave approval — works correctly
`POST /api/v1/leave/requests/<id>/approve/` as `pvt-demo-001` → 200. DetailPanel
approve flow would work end-to-end.

### e. Notifications bell — works correctly
`GET /api/v1/notifications` → 200, 17 items. `PATCH /api/v1/notifications/<id>/read`
→ 200. Navigation from notification click would work.

### f. KPI self-review — not reachable for admin (implicit safe)
`GET /api/v1/kpi/assignments/me/` returns `[]` for admin (filters by `user.id`,
no employee lookup). `MyKpiPage` only renders the self-review form for
assignments returned by this endpoint, so admin users never see the form and
can never trigger the 404. **Not a bug in the UI.**

### g. Cert / training "me" endpoints — similarly safe
`GET /api/v1/certifications/me/` and `GET /api/v1/training/assignments/me/`
filter by `request.user.id` (not by Employee FK) and return `[]` for admin.
`MyCertificationsPage` and `MyTrainingPage` show empty-state naturally. **Safe.**

### h. LeaveApplyPage unit test — fixed alongside the page
The test used `vi.spyOn(global, "fetch")` which didn't cover the
`openapi-fetch`-based `employeeApi.getMe()` call added by the fix. Updated the
test to mock `@/modules/employee/api` directly (returns a stub employee record)
so the form renders and the original assertion holds.

---

## 4. Suggested next 3 issues to address

1. **Employee directory page at `/employees/<id>`** — ⌘K navigates there but
   the route likely doesn't render an individual employee profile. Confirm and
   implement `EmployeeDetailPage` (known gap from ⌘K click handler).

2. **Leave backend: allow claim-style `perform_create` message consistency** —
   The leave view raises `NotFound("No employee profile linked to this user.")`
   identical to claims. The frontend now gates both. However, an HR user could
   bypass the UI and hit the API directly, getting a bare 404. Option B
   (admin-on-behalf) would be a proper follow-up for both claims and leave.

3. **`text-text-disabled` (`#4A4D58`) contrast** — ratio 2.33:1 against canvas,
   intentionally below AA for disabled states (WCAG 1.4.3 exempts truly disabled
   controls). Currently no `aria-disabled` attribute is set on disabled inputs,
   so axe has no way to skip the warning. Add `aria-disabled="true"` + CSS
   `opacity-50` pattern to disabled inputs instead of relying on the low-contrast
   colour token alone.
