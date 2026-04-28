# HRMS UI/UX Redesign — Design Spec

**Status:** Approved 2026-04-28 · ready for implementation planning
**Scope:** Phase 1 frontend only (`apps/web`). Backend is unchanged.
**Approach:** B — Shell + signature pages. The chrome and 5 high-traffic pages get full Design_2 fidelity; remaining pages inherit the new shell + tokens automatically.
**Stack:** shadcn/ui (themed) on top of the existing Vite + React 18 + TypeScript + Tailwind setup.

Reference materials live at `References/Design/Design_1/*.png` (CoCreate — themes/styles) and `References/Design/Design_2/*.jpg` (HRSync — UX patterns). Visual companion mockups for every decision below are saved under `.superpowers/brainstorm/1164558-1777379344/content/` (gitignored).

---

## 1. Design tokens

All token values are concrete; the implementation copies these directly into CSS custom properties + Tailwind config.

### 1.1 Surfaces & text

| Token            | Hex         | Use |
|------------------|-------------|-----|
| `--bg-canvas`    | `#0B0B14`   | Page background (under everything) |
| `--bg-surface`   | `#15151F`   | Cards, sidebar, top-bar, table rows |
| `--bg-hover`     | `#1B1B27`   | Hover state on rows / interactive surfaces |
| `--bg-elevated`  | `#1E1E2C`   | Detail panel, dialogs, popovers |
| `--text-primary` | `#FFFFFF`   | Headings, primary values |
| `--text-secondary` | `#B6B8C0` | Body text, table cells |
| `--text-tertiary`  | `#6E7079` | Labels, helper text, placeholder |
| `--text-disabled`  | `#4A4D58` | Disabled state |
| `--border-subtle`  | `rgba(255,255,255,0.06)` | Default border |
| `--border-strong`  | `rgba(255,255,255,0.12)` | Hovered/focused border |

### 1.2 Accent — violet (Design_1 signature)

| Token             | Hex        | Use |
|-------------------|------------|-----|
| `--accent-50`     | `#F3EFFF`  | Lightest tint (rare; on-pastel text) |
| `--accent-200`    | `#C9BCFF`  | Active sidebar text, links |
| `--accent-500`    | `#7C5CFF`  | Primary buttons, focus ring, brand mark |
| `--accent-600`    | `#6B4FE0`  | Primary hover |
| `--accent-700`    | `#5A40C2`  | Primary pressed |
| `--accent-glow`   | `linear-gradient(90deg, rgba(124,92,255,0.6), rgba(124,92,255,0.05))` | Sidebar active highlight |

### 1.3 Pastels — category accents (Design_2 signature)

Each pastel doubles as a semantic token. UI must always render text on top with sufficient contrast (verified ≥ 7:1 in §5.4).

| Token          | Hex       | Semantic alias  | Use |
|----------------|-----------|-----------------|-----|
| `--pastel-peach`    | `#FCC59A` | (no semantic alias — category-only) | KPI tile circles, unread badges |
| `--pastel-lavender` | `#BFB1F2` | (category-only) | Annual leave pill, "Approved" KPI |
| `--pastel-mint`     | `#97D9C7` | `--success`     | Approved status, on-time, present |
| `--pastel-yellow`   | `#FCD685` | `--warning`     | Pending status, late, pending KPI |
| `--pastel-coral`    | `#F4A0A0` | `--error`       | Rejected, absent, MFA-required banner |
| `--pastel-sky`      | `#A0CFEC` | `--info`        | Informational pills, KPI category |

Translucent pill backgrounds use `rgba(<pastel>, 0.16)` with the pastel as foreground text. Solid KPI circle backgrounds use the pastel directly with `--bg-surface` (`#15151F`) as foreground.

### 1.4 Typography

```
font-sans:  'Inter', system-ui, sans-serif        (load via @fontsource-variable/inter)
font-mono:  'JetBrains Mono', ui-monospace        (load via @fontsource/jetbrains-mono)
```

| Token       | Size / line-height / weight | Use |
|-------------|-----------------------------|-----|
| `display`   | 32 / 40 / 700               | Login splash, Dashboard greeting |
| `h1`        | 24 / 32 / 700               | Page title in TopBar |
| `h2`        | 18 / 26 / 600               | Section heading inside cards |
| `h3`        | 14 / 20 / 600               | Card title, KPI value when paired with label |
| `body`      | 13 / 20 / 400               | Default body, table cells |
| `small`     | 11 / 16 / 500               | Helper text, metadata, timestamps |
| `label`     | 10 / 14 / 700 / `letter-spacing: 0.08em` / `text-transform: uppercase` / `color: var(--text-tertiary)` | KPI-tile labels, table headers, group dividers |
| `mono`      | 12 / 16 / 500 / `font-mono` | Employee codes (`PVT-OPS-001`), masked IC, account numbers |

### 1.5 Spacing & radii

Spacing follows Tailwind's default 4 px base. Most layouts use `space-3` (12 px) for tight grouping, `space-4` (16 px) for default gaps, `space-6` (24 px) for section gaps, `space-8` (32 px) for page padding.

| Radius token | Value   | Use |
|--------------|---------|-----|
| `--radius-sm`   | 4 px    | Chips, small icons |
| `--radius-md`   | 8 px    | Buttons, inputs, rows |
| `--radius-lg`   | 12 px   | Cards, KPI tiles |
| `--radius-xl`   | 18 px   | Modals, slide-over panel |
| `--radius-full` | 999 px  | Pills, avatars |

### 1.6 Shadows

Used sparingly — only on floating elements (dropdowns, modals, toasts, tooltips). Dark theme means we don't need ambient shadows on cards.

| Token          | Value |
|----------------|-------|
| `--shadow-popover` | `0 8px 24px rgba(0,0,0,0.4)` |
| `--shadow-modal`   | `0 16px 48px rgba(0,0,0,0.55)` |
| `--shadow-toast`   | `0 8px 24px rgba(0,0,0,0.4)` |
| `--shadow-panel`   | `-10px 0 40px rgba(0,0,0,0.4)` (DetailPanel from right edge) |

---

## 2. Layout shell

The chrome that wraps every signed-in route. Implemented as `<AppShell>` in `apps/web/src/components/shell/AppShell.tsx`.

### 2.1 Sidebar (220 px / 56 px collapsed)

- Fixed width 220 px ≥ 1024 px viewport; collapses to 56 px icon-only below 1024 px (auto-expand on hover).
- Vertical layout: brand mark + `PROVINTELL` wordmark → ⌘K search trigger → grouped nav → user pill at bottom.
- **Brand mark**: 22 × 22 px gradient square `linear-gradient(135deg, #7C5CFF, #BFB1F2)` + `radius-md`. Wordmark in 14 / 700 white with `letter-spacing: 0.04em`.
- **⌘K search trigger** is a clickable pill that opens the global Command palette (shadcn `Command`). Visible on desktop; hidden when sidebar is collapsed (the TopBar ⌘K is the always-on entry point).
- **Grouped nav**: three groups in fixed order — `Personal`, `Team`, `Admin`. Items inside a group are ordered by frequency-of-use, not alphabetically. Empty groups auto-hide based on the user's permissions (`useCan` hook). Group label is `label` token (uppercase, tertiary text).
- **Active item**: `--accent-glow` gradient background + 1 px inset ring `rgba(124,92,255,0.4)` + `--accent-200` text + filled `--accent-500` icon dot.
- **Unread badges**: pastel-peach pill on `Approvals` and `Notifications` items. Badge value comes from `notifications:unreadCount` query.
- **User pill at bottom**: 24 px avatar + name + role-and-org line; clicking opens DropdownMenu with "Profile", "Preferences", "Sign out".

### 2.2 Top bar

- Three-zone flex layout: left (breadcrumb + page title), centre (global ⌘K search), right (icon actions + user pill).
- **Breadcrumb**: `crumb1 / crumb2` in `--text-tertiary`, 11 px. Page title is `h1` token directly underneath.
- **Global search**: 320 px max-width pill input with `⌘K` indicator, opens the same Command palette as the sidebar. Focus on `Cmd/Ctrl+K` or `/`.
- **Icon actions**: 32 × 32 px outlined buttons for help, notifications. Notification bell shows the same `--pastel-peach` pulse dot when there are unread items.
- **User pill**: avatar + name + role line in a rounded-full pill. Clicking opens the same DropdownMenu as the sidebar bottom pill (single source of truth — both wire to `<UserMenu>`).

### 2.3 Detail panel (slide-over from right)

A reusable component used wherever a row click should reveal details without navigating away.

- 320 px wide, full canvas height, `--bg-elevated`, `--shadow-panel`.
- Pushes the canvas content left on `≥ 1280 px` (so the source row stays visible). Below that it overlays.
- Header: title + close `×` button. Content: structured key-value grid. Footer: action bar (e.g., Approve / Reject).
- Closes on Esc, on `×` click, or on backdrop click (only when in overlay mode).
- `role="dialog" aria-modal="true"` with focus trap. Focus returns to the originating row on close.

### 2.4 Responsive breakpoints

| Breakpoint | Width  | Behaviour |
|------------|--------|-----------|
| `mobile`   | < 640  | Sidebar becomes a Sheet drawer triggered by hamburger. KPI rows go 2-up. EmployeeCard grid 1-up. Tables collapse to stacked rows. |
| `tablet`   | ≥ 640  | Sidebar drawer + collapsed icon rail at 56 px. KPI rows 2-up. EmployeeCard grid 2-up. |
| `laptop`   | ≥ 1024 | Sidebar fully expanded at 220 px. KPI rows 4-up. EmployeeCard grid 3-up. DetailPanel overlays canvas. |
| `desktop`  | ≥ 1280 | DetailPanel pushes canvas left rather than overlaying. EmployeeCard grid 4-up. |

---

## 3. Page templates (5 signature pages)

### 3.1 Dashboard — three variants

Single component file `apps/web/src/modules/dashboard/DashboardPage.tsx` reads `?variant=me|team|admin` and the user's permissions to pick the right tile/card set. Backend already supports `/api/v1/dashboards/{me|team|admin}`.

**Common shell:** `PageHeader` (with personalised greeting on `me`: "Good morning, {firstName} ☀") → 4-up KPI tile row → 2-column body (left 2/3, right 1/3) → optional third row depending on variant.

**Variant /me — employee homepage**

- KPI tiles: `Annual leave` (peach) · `Pending requests` (lavender) · `Attendance %` (mint) · `Open KPIs` (yellow)
- Left body: Attendance overview donut (this week) + Recent activity feed (last 5 items across leave/claim/cert/payslip)
- Right body: Clock-in/out widget (big primary button, current time, last action) + Upcoming holidays card

**Variant /team — manager homepage**

- KPI tiles: `Pending approvals` (peach) · `Team attendance today` (mint) · `Certs expiring < 30 d` (yellow) · `KPI cycle progress` (lavender)
- Left body: Today's attendance log (rows of direct reports with in/out times + status pills) + Pending approvals preview (top 3, link to inbox)
- Right body: Upcoming team leave + Birthdays this month

**Variant /admin — HR/Org admin homepage**

- KPI tiles: `Headcount` (lavender) · `On leave today` (peach) · `Pending payroll` (yellow) · `Unread alerts` (coral)
- Left body: Today's attendance log (org-wide, paginated) + Recent activity (org-wide)
- Right body: Birthdays + Upcoming holidays + Quick actions (Add employee, Run payroll, View reports)

### 3.2 Employees directory

`apps/web/src/modules/employee/EmployeesPage.tsx`

- `PageHeader` with title "Employees" and `+ Add employee` action button (gated by `employee:write`).
- Filter bar: Department dropdown, Sort dropdown, View toggle (cards ⇆ table). Filter state lives in URL params for shareable links.
- **Card view (default)**: 4-up grid using `<EmployeeCard>`. Each card shows avatar (gradient bg from name hash), full name, role pill (violet), 3 quick-action icons (mail / phone / view-profile), and an Attendance % progress bar (gradient fill matching card avatar).
- **Table view**: `<DataTable>` with columns: Avatar+Name, Code, Department, Role, Status, Joined. Row click opens DetailPanel.
- Empty state: violet 🌴 icon + "No employees yet" + `+ Add employee` button.

### 3.3 Leave page

`apps/web/src/modules/leave/MyLeavePage.tsx` (employee), `apps/web/src/modules/leave/TeamLeavePage.tsx` (manager). Same template, different filter scope.

- 4-up KPI row: `Total leave` (sky) · `Approved` (lavender) · `Rejected` (coral) · `Pending` (yellow). Tile values come from `/api/v1/leave/balances/me/` aggregated.
- Below: `<DataTable>` with columns: bulk-select checkbox, Employee (avatar + name + role), Type (pastel pill), From, To, Days, Status (pastel pill), action menu `⋯`. Row click opens DetailPanel.
- DetailPanel shows: type, dates, days, reason, attachments, approval history (timeline). Action footer: Approve / Reject / Withdraw / Cancel based on user perms + request state.
- `+ Apply for leave` action button in the header opens a Sheet form (date range, type, reason, attachment).

### 3.4 Approvals inbox (unified)

`apps/web/src/modules/approvals/UnifiedInboxPage.tsx`

- Type filter pills row at top: `All` · `Leave` · `Claims` · `KPI` (counts displayed on each pill). Multi-select.
- Below: split layout. Left = list of `<ApprovalRow>` items (avatar, "{Employee} · {action summary}", "Submitted {when} · {reason snippet}", type pill). Right = embedded DetailPanel on `≥ 1280 px`, slide-over below that.
- Selected row gets `--accent-500` border + `rgba(124,92,255,0.08)` bg.
- DetailPanel is the same component from §2.3 — wired to render the right footer based on type (LeaveApprovalFooter / ClaimApprovalFooter / KpiReviewFooter).
- Bulk-select checkbox column at the far left of each row enables a sticky bottom bar with "Approve {N}" / "Reject {N}" buttons when ≥ 1 item is selected.
- Empty state per filter: "No pending {type} approvals — you're all caught up 🎉".

### 3.5 My Profile

`apps/web/src/modules/employee/MyProfilePage.tsx`

- 2-column layout (240 px left / fluid right).
- **Left card**: 84 px avatar (gradient from name hash) + full name + role pill + 5 quick stats (Joined, Tenure, Annual leave balance, Attendance %, Reports to). All read-only.
- **Right column**: 3 stacked sections — `Personal`, `Employment`, `Banking`. Each has a header row with section title + `Edit` text button. Body is a 3-column grid of key-value pairs.
- **Encrypted fields** (IC, EPF, account number): always shown as `•••• {last4}` in `mono` typography. The Edit form for those fields requires the user to type the value fresh — never round-tripped from the API.
- **Banking section** is visually flagged with a `--pastel-coral` border + an `MFA required` pill in its header. Clicking Edit triggers an MFA prompt before the form is shown; the resulting save call sends the TOTP code in `X-MFA-Code`.
- HR-managed fields (department, manager, role title, employment type) are **read-only** in this view — they update from the Employees admin page.

---

## 4. Component library

### 4.1 Primitives — themed shadcn/ui

Run `npx shadcn@latest init` once with our token CSS variables. Then `npx shadcn@latest add` for each component. Output lands in `apps/web/src/components/ui/` and is committed to the repo.

| Component        | shadcn id          | Replaces / wraps |
|------------------|--------------------|------------------|
| Button           | `button`           | All current `<button>` usage |
| Input            | `input`            | Form inputs |
| Textarea         | `textarea`         | Multi-line inputs |
| Select           | `select`           | Dropdown selects |
| Checkbox         | `checkbox`         | Bulk-select, settings toggles |
| Switch           | `switch`           | Notification preference toggles |
| RadioGroup       | `radio-group`      | Single-pick options |
| Dialog           | `dialog`           | Confirm / form modals |
| Sheet            | `sheet`            | Apply-leave drawer, mobile sidebar |
| DropdownMenu     | `dropdown-menu`    | User menu, row `⋯` action menu |
| Popover          | `popover`          | Date picker triggers, inline help |
| Tooltip          | `tooltip`          | Icon hint, keyboard shortcut hint |
| Tabs             | `tabs`             | Section switching inside pages |
| Toast            | `sonner`           | Success / error notifications |
| Skeleton         | `skeleton`         | Loading states ≥ 200 ms |
| Avatar           | `avatar`           | All user avatars |
| ScrollArea       | `scroll-area`      | Long lists (notifications, activity) |
| Command          | `command`          | ⌘K global search |
| Calendar         | `calendar`         | Date pickers |
| Progress         | `progress`         | KPI score, leave balance bars |
| Separator        | `separator`        | Section dividers |

### 4.2 Composed — HRMS-specific

All under `apps/web/src/components/hrms/`. Each has a co-located `.test.tsx` covering rendering + key states.

| Component             | Inputs                                                       | Used by |
|-----------------------|--------------------------------------------------------------|---------|
| `<KpiTile>`           | `label`, `value`, `delta?`, `tone: peach\|lavender\|mint\|yellow\|coral\|sky`, `icon?` | Dashboard (×3), Leave |
| `<EmployeeCard>`      | `employee`, `metric: { label, value, percent }`, `actions[]` | Employees, Roster preview |
| `<DataTable>`         | `columns`, `rows`, `onRowClick?`, `bulkSelect?`, `emptyState?` | Leave, Claims, Employees (table), Reports |
| `<DetailPanel>`       | `open`, `onClose`, `title`, `children`, `footer?`             | Approvals, Leave, Claims |
| `<DonutChart>`        | `segments: { value, color, label }[]`, `centerLabel` (CSS conic-gradient, no chart lib) | Dashboard attendance, KPI cycle |
| `<ProgressBar>`       | `value`, `max`, `gradient: [color, color]`, `label?`          | EmployeeCard, KPI score, Leave balance |
| `<ApprovalActionBar>` | `subjectId`, `subjectType`, `onApproved`, `onRejected`        | DetailPanel footer for any approvable item |
| `<ClockInOutWidget>`  | (uses `useClockState` hook backed by `/api/v1/attendance/today/`) | Dashboard /me, MySchedulePage |
| `<AttendanceLogRow>`  | `employee`, `clockIn`, `clockOut?`, `status`                  | Dashboard /team, Roster |
| `<FileUploader>`      | `onUploaded(s3Key)`, `accept`, `maxSize`                      | Claim attachments, Cert documents |
| `<NotificationCard>`  | `notification`, `onRead`                                      | NotificationPanel |
| `<PageHeader>`        | `breadcrumb?`, `title`, `subtitle?`, `actions?`               | Every page |
| `<StatusPill>`        | `tone`, `label`, `icon?`                                      | Anywhere a status is shown |
| `<EmptyState>`        | `icon`, `title`, `description`, `action?`                     | Empty tables, lists, dashboards |

### 4.3 Layout

| Component   | Path | Notes |
|-------------|------|-------|
| `<AppShell>`  | `components/shell/AppShell.tsx`   | Wraps signed-in `<Outlet />` |
| `<Sidebar>`   | `components/shell/Sidebar.tsx`    | Replaces TopBar-only nav |
| `<TopBar>`    | `components/shell/TopBar.tsx`     | Rewritten — keeps name, new content |
| `<UserMenu>`  | `components/shell/UserMenu.tsx`   | Single dropdown shared by sidebar pill + topbar pill |

---

## 5. Motion & accessibility

### 5.1 Motion tokens

| Token             | Duration | Easing                                      | Where |
|-------------------|----------|---------------------------------------------|-------|
| `--motion-instant`| 0 ms     | —                                           | Toggles, checkboxes |
| `--motion-fast`   | 120 ms   | `cubic-bezier(0.16, 1, 0.3, 1)` enter / `cubic-bezier(0.4, 0, 1, 1)` exit | Hover, focus, button press, sidebar highlight |
| `--motion-base`   | 200 ms   | same                                        | Toast, dropdown, tooltip, tab switch |
| `--motion-slow`   | 320 ms   | same                                        | DetailPanel slide, Sheet, page transition |

Skeleton shimmer: 1.4 s linear infinite. Shimmers below 200 ms render time should never be shown — pass through directly.

### 5.2 Reduced motion fallback

Single global rule in `index.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

State changes still apply — only the animation is suppressed.

### 5.3 Keyboard navigation

- Skip-to-main-content link is the first focusable element on every page.
- Focus ring: `outline: 3px solid rgba(124,92,255,0.4); outline-offset: 2px;` applied via `:focus-visible` (so mouse clicks don't show it but Tab does).
- Every interactive element reachable via Tab; logical order matches visual flow.
- ⌘K opens Command palette from anywhere (registered in `AppShell`). Palette fuzzy-searches: pages, employees, recent actions ("approve last leave", "clock in", "view payslip Apr 2026"). Built on shadcn `Command`.

### 5.4 Color contrast — WCAG AA verified

Every text-on-surface pair meets AA (4.5 : 1 body / 3 : 1 large). Spot-checked combinations:

| Foreground          | Background      | Ratio    | Status |
|---------------------|-----------------|----------|--------|
| White text          | `--bg-canvas`   | 19.4 : 1 | AAA |
| `--text-secondary`  | `--bg-surface`  | 9.6 : 1  | AAA |
| `--text-tertiary`   | `--bg-surface`  | 4.7 : 1  | AA |
| `--accent-200` (links) | `--bg-surface` | 10.4 : 1 | AAA |
| `--pastel-mint` (success pill) | `--bg-surface` | 10.7 : 1 | AAA |
| `--pastel-yellow` (warning pill) | `--bg-surface` | 12.6 : 1 | AAA |
| `--pastel-coral` (error pill) | `--bg-surface` | 7.6 : 1 | AAA |
| Dark text on `--pastel-peach` (KPI circle) | `#15151F` text on `#FCC59A` | 11.2 : 1 | AAA |

Colour is never the only signal. Status pills always pair color + icon glyph + text label. Charts always have legends.

### 5.5 Tap targets

Minimum 44 × 44 px on touch viewports (WCAG 2.5.5). Icon-only buttons in tables and the top-bar use an invisible 44 × 44 hit region around the visual icon (achieved via padding + negative margin trick in `.icon-button` utility class).

### 5.6 Screen-reader rules

- Every icon-only `<button>` has `aria-label`.
- Every `<input>` has a paired `<label>`; placeholders are not labels.
- Decorative SVG / pastel circles use `aria-hidden="true"`.
- Toasts use `aria-live="polite"`; assertive errors use `aria-live="assertive"`.
- Form errors are linked via `aria-describedby`.
- Sidebar is `<nav aria-label="Primary">`; nested groups use `aria-labelledby`.
- `DetailPanel` is `role="dialog" aria-modal="true"` with focus trap; Esc closes; focus returns to originator.
- shadcn primitives ship most of these; we only need to remember them for our composed components.

---

## 6. Out of scope (Phase 1 redesign)

- **Light mode** — dark only for v1; revisit when there's user demand.
- **Multi-language UI** — copy stays in English. Malay UI deferred.
- **Themable per-org branding** — Provintell-specific colors are fine for now.
- **Print stylesheet** — payslip already has its own ReportLab PDF; no other page needs print.
- **Brand identity work** — `PROVINTELL` wordmark + gradient brand mark is the placeholder; logo asset can replace the mark later without affecting layout.
- **New backend endpoints** — every redesigned page maps to existing `/api/v1/*` endpoints. No backend changes required.
- **Mobile-only flows** — responsive is in scope; standalone PWA / app shell for shift workers is Phase 3.

---

## 7. Implementation order (handed to writing-plans)

The plan should sequence work so each batch produces something testable in isolation. Suggested batching:

1. **Token & shell foundation** — install fonts, install shadcn, write tokens to CSS vars + Tailwind config, build `<AppShell>` / `<Sidebar>` / `<TopBar>` / `<UserMenu>` / `<PageHeader>`, replace the existing TopBar-only shell. After this batch, every existing page renders inside the new shell with the new tokens — no pages touched yet.
2. **Composed components** — build the 14 composed components from §4.2, each with tests. They're used by the signature pages; some are also used in unchanged pages (e.g., `<StatusPill>` will replace ad-hoc pills repo-wide).
3. **Signature pages** — redesign Dashboard, Employees, Leave, Approvals, My Profile. One sub-task per page.
4. **Polish pass** — skeleton states, empty states, motion timings, ⌘K palette content, keyboard shortcuts, a11y audit (axe-core scan).
5. **Cleanup** — delete dead CSS / unused components from the old TopBar-only shell. Tag `v1.1.0`.

---

## 8. Acceptance criteria

- [ ] Every existing page (dashboard, leave, claims, payslip, kpi, cert, schedule, reports, etc.) renders inside the new `<AppShell>` without any per-page changes; its body inherits the dark surfaces + tokens.
- [ ] All 5 signature pages match the page-template specs in §3 within reasonable visual fidelity (subjective — informal screenshot review with the user).
- [ ] All composed components in §4.2 have a `.test.tsx` covering their stated states; existing test suite still passes (10 frontend tests today, expect ~30 after this redesign).
- [ ] axe-core passes with no violations on each signature page.
- [ ] Lighthouse a11y score ≥ 95 on each signature page.
- [ ] No regressions in API contract — same `openapi-fetch` calls, same payloads.
- [ ] Bundle size growth stays under 80 KB gzip (shadcn primitives are tree-shaken; Inter + JetBrains Mono via `font-display: swap`).

---

## 9. Open questions for plan author

- shadcn copies its primitives into `src/components/ui/`. Decision needed: do we commit them as-is (recommended — they're meant to be edited), or vendor under a single `vendor/shadcn/` namespace? Default: commit at `src/components/ui/` per shadcn convention.
- `<DonutChart>` is hand-built CSS conic-gradient. If we end up needing more chart types (line, bar) for Reports, we'll need a chart library — flag if so during plan phase. For Phase 1 redesign, donut is the only chart; conic-gradient is sufficient.
- Skip-link and focus-visible polyfills: confirm Vite + React 18 + modern browsers don't need them. Default: assume modern browsers, no polyfill.

---

*End of spec. Implementation plan to follow via the writing-plans skill.*
