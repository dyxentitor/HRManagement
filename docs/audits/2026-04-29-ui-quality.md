# UI Quality Audit — 2026-04-29

**Audit criteria (7 categories):**

| Code | Category |
|------|----------|
| L1 | Width — full canvas width with sensible max-width |
| L2 | Visual hierarchy — section titles > body > group labels |
| L3 | Content readability — human labels, human-formatted dates |
| L4 | Tags/badges — StatusPill not inline mono text in parens |
| L5 | Disabled state — opacity-60 + cursor-not-allowed + aria-disabled |
| L6 | Save UX consistency — all auto-save or all explicit Save |
| L7 | Danger zone — coral-bordered section at bottom for destructive actions |

---

## 1. Preferences page — canonical fix

**File:** `apps/web/src/modules/auth/pages/PreferencesPage.tsx`

**Before:** 4/7 — L1 squeezed to `max-w-3xl` with no side nav, L3 raw event codes shown, L4 `(security)` mono text, L5 Theme section had `opacity-60` but no `aria-disabled`/`cursor-not-allowed`, L7 Sign-out not visually separated.

**After:** 7/7

| Fix | Details |
|-----|---------|
| L1 | 2-column layout on ≥lg: 220px sticky nav rail + `max-w-3xl` fluid content column |
| L2 | Each section uses `text-h2` heading + `text-body text-text-secondary` description; group labels use `text-label uppercase text-text-tertiary` |
| L3 | Notification events translated via `event-labels.ts` → "Successful sign-in" not `auth.login`; grouped by domain |
| L4 | `(security)` replaced with `<StatusPill tone="coral" label="Security" />`; Phase 1.5 pill `<StatusPill tone="lavender" label="Phase 1.5" />` |
| L5 | Theme card: `aria-disabled="true"` + `opacity-60` + `cursor-not-allowed` + `pointer-events-none` |
| L6 | Locale → auto-save with `toast.success("Locale updated")`; Notifications → explicit Save with sticky bar that shows "All preferences saved" when clean, enabled only when dirty |
| L7 | "Danger zone" section with `border-coral/30`, `mt-12` top margin, two-step confirm before Sign out |

**New files:**
- `apps/web/src/modules/notifications/event-labels.ts` — 22 event label mappings + domain label map
- `apps/web/src/modules/auth/pages/PreferencesPage.test.tsx` — 5 test cases

---

## 2. Per-page scorecard

1 = pass, 0 = fail, N/A = not applicable

| Page | L1 | L2 | L3 | L4 | L5 | L6 | L7 | Score | Verdict |
|------|----|----|----|----|----|----|----|-------|---------|
| Dashboard (me/team/admin) | 1 | 1 | 1 | 1 | N/A | N/A | N/A | 4/4 | PASS — redesigned in v1.1.0 |
| MyProfilePage | 1 | 1 | 1 | 1 | N/A | N/A | N/A | 4/4 | PASS — redesigned in v1.1.0 |
| **PreferencesPage** | **1** | **1** | **1** | **1** | **1** | **1** | **1** | **7/7** | **FIXED in this PR** |
| EmployeesPage | 1 | 1 | 1 | 1 | N/A | N/A | N/A | 4/4 | PASS — uses DataTable + EmployeeCard |
| EmployeeDetailPage | 1 | 1 | 0 | 1 | N/A | N/A | N/A | 3/4 | MINOR — hire_date shown as ISO string not "Jan 2024" in Employment section |
| MyLeavePage | 1 | 1 | 0 | 1 | N/A | N/A | N/A | 3/4 | MINOR — start/end dates in table rows are ISO strings |
| LeaveApplyPage | 0 | 0 | 1 | N/A | N/A | 1 | N/A | 2/3 | PARTIAL — bare `h1 text-2xl`, no PageHeader, no max-w-xl centering |
| UnifiedInboxPage | 1 | 1 | 1 | 1 | N/A | N/A | N/A | 4/4 | PASS — uses ApprovalActionBar + StatusPill |
| MySchedulePage | 0 | 0 | 0 | N/A | N/A | N/A | N/A | 0/3 | FAIL — bare h1, no PageHeader, ISO dates in headings |
| RosterPage | 0 | 0 | 0 | N/A | N/A | N/A | N/A | 0/3 | FAIL — bare h1, no PageHeader, employee codes as mono UUID |
| MyClaimsPage | 0 | 0 | 0 | 0 | N/A | N/A | N/A | 0/4 | FAIL — bare h1, ISO dates, custom StatusBadge instead of StatusPill |
| ClaimSubmitPage | 0 | 0 | 1 | N/A | N/A | 1 | N/A | 2/3 | PARTIAL — bare h1, no PageHeader |
| MyPayslipsPage | 0 | 0 | 0 | N/A | N/A | N/A | N/A | 0/3 | FAIL — bare h1, no PageHeader, ISO dates |
| **PayrollAdminPage** | **1** | **1** | **1** | **1** | N/A | **1** | N/A | **5/5** | **FIXED in this PR** |
| **MyKpiPage** | **1** | **1** | **1** | **1** | N/A | **1** | N/A | **5/5** | **FIXED in this PR** |
| **KpiManagerPage** | **1** | **1** | **1** | **1** | N/A | **1** | N/A | **5/5** | **FIXED in this PR** |
| KpiAdminPage | 0 | 0 | 0 | N/A | N/A | N/A | N/A | 0/3 | FAIL — bare h1, no PageHeader, ISO dates in form |
| MyCertificationsPage | 0 | 0 | 0 | 0 | N/A | N/A | N/A | 0/4 | FAIL — bare h1, ISO dates shown raw, plain `capitalize` not StatusPill |
| MyTrainingPage | 0 | 0 | 0 | 0 | N/A | N/A | N/A | 0/4 | FAIL — bare h1, ISO due dates, plain status text not StatusPill |
| AdminCertPage | 0 | 0 | 0 | 0 | N/A | N/A | N/A | 0/4 | FAIL — bare h1, employee_id shown as UUID, ISO dates, plain `capitalize` |
| ReportsListPage | 1 | 0 | 0 | N/A | N/A | N/A | N/A | 1/3 | PARTIAL — has max-w-4xl but bare h1; report codes used as module heading |
| ReportRunPage | 1 | 0 | 1 | N/A | N/A | N/A | N/A | 2/3 | PARTIAL — has max-w-screen-xl, good filter labels, but bare h1 |
| ForgotPasswordPage | 1 | 1 | 1 | N/A | N/A | 1 | N/A | 4/4 | PASS — clean auth page, full-screen modal pattern |
| ResetPasswordPage | 1 | 1 | 1 | N/A | N/A | 1 | N/A | 4/4 | PASS — clean auth page |
| LoginPage | 1 | 1 | 1 | N/A | N/A | 1 | N/A | 4/4 | PASS — redesigned in v1.2.0 |

---

## 3. Top 5 worst pages

### 1. MyCertificationsPage (`/certifications/me`)
- L1: `max-w-4xl` but no `mx-auto` and no PageHeader — content floats left on wide screens
- L2: `<h1 className="text-2xl font-bold">` — not using design system tokens
- L3: ISO dates shown raw in Issued/Expires columns (e.g. "2024-03-15")
- L4: Status column is plain `capitalize` text, not StatusPill

### 2. MyTrainingPage (`/training/me`)
- L1/L2: Bare `<h1 className="text-2xl font-bold">`, no PageHeader
- L3: `Due: {a.due_date}` shows ISO date string
- L4: Status rendered as `<span className={statusBadge(s)}>{a.status}</span>` — raw text with colour, not StatusPill

### 3. AdminCertPage (`/certifications/admin`)
- L1/L2: Bare `<h1 className="text-2xl font-bold">`, no PageHeader
- L3: `employee_id` column shows raw UUID, Expires shown as ISO date
- L4: Status column is plain `capitalize` text

### 4. MySchedulePage (`/schedule/me`)
- L1/L2: `max-w-4xl` with bare h1 `text-2xl font-bold`, no PageHeader
- L3: "Week of 2026-04-29" — raw ISO in heading; `todayRec?.status` shown as raw snake_case
- L4/L5: No pills anywhere; attendance status is inline text

### 5. KpiAdminPage (`/kpi/admin`)
- L1/L2: `max-w-4xl` with bare h1, no PageHeader
- L3: ISO dates in cycle form labels; cycle status shown as `capitalize`
- L4: Cycle status in table is plain `capitalize` text, not StatusPill

---

## 4. Recommended next 3 to fix

| Page | Effort | What's needed |
|------|--------|---------------|
| MyCertificationsPage | S (2h) | PageHeader, ISO→human dates, StatusPill for status, `mx-auto` on container |
| MySchedulePage | S (2h) | PageHeader, human-readable week heading, StatusPill for attendance status |
| AdminCertPage | M (3h) | PageHeader, StatusPill for status, UUID→employee name lookup or truncate cleanly, ISO→human dates |

Minor fixes that are single-line changes (not warranting a full PR):
- `LeaveApplyPage` — add `PageHeader` and wrap in `max-w-xl mx-auto`
- `ClaimSubmitPage` — same as above
- `EmployeeDetailPage` — hire_date in Employment section: `new Date(employee.hire_date).toLocaleDateString(…)` instead of raw ISO
- `MyLeavePage` — date columns in DataTable: format start_date/end_date as "15 May 2026"
