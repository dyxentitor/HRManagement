# HRMS UI/UX Redesign — Roadmap

**Spec:** `docs/superpowers/specs/2026-04-28-hrms-ui-redesign.md`
**Goal:** Replace the placeholder light-theme top-bar UI with a dark-themed sidebar shell + 5 redesigned signature pages, on shadcn/ui themed to our token system.
**Approach:** B (from spec §) — shell + 5 signature pages. Other pages inherit the shell + tokens for free.

This roadmap splits the implementation into 4 sub-plans. Each one ends in a shippable state — tests pass, app boots, you can browse the site. Stop after any sub-plan and the system still works. **Execute in order; do not parallelise across sub-plans** (they share files).

---

## Sub-plan order

| # | Sub-plan | File | Approx. tasks |
|---|----------|------|---------------|
| 1 | Foundation — tokens, fonts, shadcn primitives, layout shell | `2026-04-28-hrms-ui-foundation.md` | 7 |
| 2 | Composed components — 14 HRMS-specific building blocks | `2026-04-28-hrms-ui-components.md` | 14 |
| 3 | Signature pages — Dashboard, Employees, Leave, Approvals, My Profile | `2026-04-28-hrms-ui-pages.md` | 5 |
| 4 | Polish — ⌘K palette, axe a11y, cleanup, tag `v1.1.0` | `2026-04-28-hrms-ui-polish.md` | 4 |

Total: ~30 tasks, ~5–7 days for one engineer working sequentially.

---

## Sub-plan 1 — Foundation

**Goal:** every existing page renders inside a new dark-themed sidebar shell with our design tokens applied. **No page bodies are touched.**

After Sub-plan 1 you can sign in as `admin@provintell.demo`, see the new sidebar + topbar around the (still-old) page bodies, and the test suite passes. Tag is `v1.0.x` (patch).

Tasks:
1. Install Inter + JetBrains Mono fonts via @fontsource-variable.
2. Define design tokens in `src/index.css` (CSS custom properties from spec §1).
3. Extend `tailwind.config.ts` to expose those tokens as utility classes.
4. Initialise shadcn/ui and install the 21 primitives from spec §4.1.
5. Build `<PageHeader>`, `<UserMenu>`, `<Sidebar>`, `<TopBar>` (rewrite), `<AppShell>` (rewrite).
6. Wire ⌘K command palette skeleton (just opens; populated in sub-plan 4).
7. Smoke-test: every existing route renders inside new shell without console errors.

---

## Sub-plan 2 — Composed components

**Goal:** the 14 HRMS-specific components from spec §4.2 exist with tests. They're not yet used by pages — that's Sub-plan 3.

After Sub-plan 2, `src/components/hrms/` is fully populated; running `npm test -- src/components/hrms` passes; no pages have changed visually.

Tasks (one per component):
1. `<StatusPill>` — 6 semantic tones, optional icon glyph, label.
2. `<KpiTile>` — pastel-circle icon + label + value + optional delta.
3. `<EmployeeCard>` — avatar + role pill + 3 quick-action icons + metric bar.
4. `<DataTable>` — sortable/sticky/bulk-select/click-to-detail.
5. `<DetailPanel>` — slide-over from right edge, focus-trapped.
6. `<DonutChart>` — pure CSS conic-gradient, segments + legend.
7. `<ProgressBar>` — gradient fill + optional label.
8. `<ApprovalActionBar>` — Approve / Reject + comment textarea.
9. `<ClockInOutWidget>` — big primary button, current time, last-action timestamp.
10. `<AttendanceLogRow>` — avatar + name + in/out + status pill.
11. `<FileUploader>` — drag-drop + S3 presigned upload.
12. `<NotificationCard>` — pastel icon + title + timestamp + read state.
13. `<EmptyState>` — icon + title + description + action button.
14. `<PageHeader>` — already built in sub-plan 1 at `@/components/shell/PageHeader`; pages import it directly from there. No re-export from `hrms/`.

---

## Sub-plan 3 — Signature pages

**Goal:** the 5 high-traffic pages are redesigned to spec §3 fidelity.

After Sub-plan 3, sign in as different demo users (admin / hr / ops.lead / employee) and verify the dashboard / employees / leave / approvals / profile pages match the mockups.

Tasks (one per page):
1. **Dashboard** — three variants (`/me`, `/team`, `/admin`) sharing a single page component that switches by URL param + permissions.
2. **Employees directory** — card grid (default) + table view toggle, filter bar, +Add modal.
3. **Leave page** — KPI row + DataTable with row-click DetailPanel.
4. **Unified Approvals inbox** — split layout, type filter pills, bulk-select, embedded DetailPanel on wide screens.
5. **My Profile** — left avatar card + 3 sectioned right-column cards, banking section behind MFA.

---

## Sub-plan 4 — Polish + cleanup + tag

**Goal:** everything that didn't fit into earlier sub-plans, plus ship it.

Tasks:
1. Populate ⌘K command palette with: pages, employees (search), recent actions ("approve last leave", "clock in"), keyboard shortcuts.
2. Run axe-core via `@axe-core/react` on each signature page; fix any violations.
3. Run Lighthouse a11y audit against the dev server; verify ≥ 95 on each signature page.
4. Cleanup: delete dead code from old TopBar, remove ad-hoc pills, update CHANGELOG, tag `v1.1.0`.

---

## Acceptance (matches spec §8)

- Every existing page renders inside the new `<AppShell>` without changes to its body.
- All 5 signature pages match the templates in spec §3.
- 30+ frontend tests pass (currently 10).
- axe-core: 0 violations on signature pages.
- Lighthouse a11y ≥ 95 per signature page.
- No API contract changes.
- Bundle size growth ≤ 80 KB gzip.

---

## Convention

- Branch: `ui-redesign/<sub-plan-name>` per sub-plan; merge fast-forward to master at end.
- Commit messages follow `feat(ui)`, `chore(ui)`, `test(ui)` prefixes.
- After each sub-plan: `npm test`, `npm run lint`, `npm run typecheck` all green.
- Tag at the end of sub-plan 4 only.
