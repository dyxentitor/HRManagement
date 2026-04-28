# HRMS UI Polish + Cleanup + Tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the redesign — populate the ⌘K command palette, audit accessibility with axe-core + Lighthouse, delete dead code from the old UI, bump the version, and tag `v1.1.0`.

**Architecture:** Polish-only — no new architectural decisions. Each task either fills a stub from earlier sub-plans, removes leftover code, or runs an audit + fixes regressions.

**Tech Stack:** @axe-core/react · vitest · `lighthouse` (CLI run against dev server).

**Spec reference:** `docs/superpowers/specs/2026-04-28-hrms-ui-redesign.md` §5 (motion + a11y), §7 (implementation order — batch 4 & 5).

**Pre-requisite:** Sub-plans 1, 2, 3 (`2026-04-28-hrms-ui-foundation.md`, `-components.md`, `-pages.md`) must be complete.

---

## File map

| Action | Path | Task |
|--------|------|------|
| Modify | `apps/web/src/components/shell/CommandPalette.tsx` | Task 1 |
| Modify | `apps/web/src/components/shell/CommandPalette.test.tsx` (new) | Task 1 |
| Modify | `apps/web/main.tsx` | Task 2 (axe runtime in dev) |
| New    | `apps/web/scripts/lighthouse.sh` (new) | Task 3 |
| Delete | dead code from old TopBar (kept temp link block) | Task 4 |
| Modify | `apps/web/package.json` (version bump) | Task 4 |
| Modify | `apps/api/pyproject.toml` (version bump) | Task 4 |
| Modify | `apps/api/hrms_api/settings/base.py` (`SPECTACULAR_SETTINGS["VERSION"]`) | Task 4 |
| Modify | `CHANGELOG.md` | Task 4 |

---

## Task 1: Populate ⌘K command palette

**Files:**
- Modify: `apps/web/src/components/shell/CommandPalette.tsx`
- Create: `apps/web/src/components/shell/CommandPalette.test.tsx`

The palette skeleton from Sub-plan 1 just opens. Now wire actual content: pages, employee fuzzy search, and quick actions.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/shell/CommandPalette.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { openCommandPalette } from "@/lib/cmdk";
import { CommandPalette } from "./CommandPalette";

vi.mock("@/lib/perm", () => ({ useCan: () => true }));
vi.mock("@/modules/employee/api", () => ({
	useEmployees: () => ({
		data: [
			{ id: "1", full_name: "Ops Lead", email: "ops@provintell.local" },
			{ id: "2", full_name: "Eng Lead", email: "eng@provintell.local" },
		],
	}),
}));

function renderPalette() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={qc}>
			<MemoryRouter>
				<CommandPalette />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("CommandPalette", () => {
	it("opens via the openCommandPalette() helper", () => {
		renderPalette();
		openCommandPalette();
		expect(screen.getByPlaceholderText(/Search pages/i)).toBeInTheDocument();
	});

	it("groups results into Pages / Employees / Actions", () => {
		renderPalette();
		openCommandPalette();
		expect(screen.getByText(/Pages/i)).toBeInTheDocument();
		expect(screen.getByText(/Employees/i)).toBeInTheDocument();
		expect(screen.getByText(/Actions/i)).toBeInTheDocument();
	});

	it("filters items by typed query", async () => {
		const user = userEvent.setup();
		renderPalette();
		openCommandPalette();
		const input = screen.getByPlaceholderText(/Search pages/i);
		await user.type(input, "ops");
		expect(screen.getByText("Ops Lead")).toBeInTheDocument();
		expect(screen.queryByText("Eng Lead")).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/shell/CommandPalette.test.tsx
```

Expected: FAIL — `useEmployees` not consumed; `Employees` group missing.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/shell/CommandPalette.tsx
import { Calendar, Clock, FileSpreadsheet, Inbox, LayoutDashboard, UserCircle, Users } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { useCommandPalette } from "@/lib/cmdk";
import { useCan } from "@/lib/perm";
import { useEmployees } from "@/modules/employee/api";

const PAGES = [
	{ label: "Dashboard", to: "/", icon: LayoutDashboard, perm: "" },
	{ label: "My Profile", to: "/me/profile", icon: UserCircle, perm: "" },
	{ label: "Leave", to: "/leave/me", icon: Calendar, perm: "leave:request:create:self" },
	{ label: "Approvals", to: "/approvals", icon: Inbox, perm: "approvals:inbox:read" },
	{ label: "Employees", to: "/employees", icon: Users, perm: "employee:read:org" },
	{ label: "Reports", to: "/reports", icon: FileSpreadsheet, perm: "report:list" },
];

export function CommandPalette() {
	const { open, setOpen } = useCommandPalette();
	const nav = useNavigate();
	const { data: employees = [] } = useEmployees();

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen(!open);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, setOpen]);

	const go = (to: string) => {
		setOpen(false);
		nav(to);
	};

	const pages = PAGES.filter((p) => p.perm === "" || useCan(p.perm));

	return (
		<CommandDialog open={open} onOpenChange={setOpen}>
			<CommandInput placeholder="Search pages, employees, actions…" />
			<CommandList>
				<CommandEmpty>No results.</CommandEmpty>

				<CommandGroup heading="Pages">
					{pages.map((p) => {
						const Icon = p.icon;
						return (
							<CommandItem key={p.to} onSelect={() => go(p.to)}>
								<Icon className="size-4 mr-2" aria-hidden /> {p.label}
							</CommandItem>
						);
					})}
				</CommandGroup>

				<CommandGroup heading="Employees">
					{(employees as Array<{ id: string; full_name: string; email?: string }>).map((emp) => (
						<CommandItem
							key={emp.id}
							onSelect={() => go(`/employees/${emp.id}`)}
							value={`${emp.full_name} ${emp.email ?? ""}`}
						>
							<UserCircle className="size-4 mr-2" aria-hidden />
							{emp.full_name}
							{emp.email && <span className="ml-2 text-text-tertiary text-small">{emp.email}</span>}
						</CommandItem>
					))}
				</CommandGroup>

				<CommandGroup heading="Actions">
					<CommandItem onSelect={() => go("/schedule/me")}>
						<Clock className="size-4 mr-2" aria-hidden /> Clock in / out
					</CommandItem>
					<CommandItem onSelect={() => go("/leave/me?apply=1")}>
						<Calendar className="size-4 mr-2" aria-hidden /> Apply for leave
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/shell/CommandPalette.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Smoke test**

In the browser, press ⌘K (Mac) or Ctrl+K (Linux/Windows). The palette opens. Type "ops" — Ops Lead surfaces under Employees. Click — navigates to `/employees/<id>`. Type "leave" — Leave (page) and Apply for leave (action) both show.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/shell/CommandPalette.tsx apps/web/src/components/shell/CommandPalette.test.tsx
git commit -m "feat(ui): ⌘K palette — pages + employee fuzzy search + quick actions"
```

---

## Task 2: axe-core in dev mode

**Files:**
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install axe-core for React**

```bash
cd apps/web && npm install --save-dev @axe-core/react
```

- [ ] **Step 2: Wire axe-core in dev only**

Edit `apps/web/src/main.tsx`. Add at the end of the file:

```tsx
// apps/web/src/main.tsx (append below the existing render call)
if (import.meta.env.DEV) {
	void import("@axe-core/react").then(({ default: axe }) => {
		void import("react-dom").then((ReactDOM) => {
			void import("react").then((React) => {
				axe(React, ReactDOM, 1000);
			});
		});
	});
}
```

- [ ] **Step 3: Run dev server and check console**

```bash
cd apps/web && npm run dev
```

Open the browser to http://localhost:5173/, sign in, and click through every signature page (Dashboard, Employees, Leave, Approvals, My Profile). Open the DevTools console and look for axe-core violations.

For each violation:
- Read the `Help` link in the warning.
- Apply the fix (typically: add an aria-label, fix a heading hierarchy, or wrap a checkbox in a label).
- Reload the page; repeat until console is clean.

Common fixes you may need:
- `<button>` with only an icon: add `aria-label`.
- Form `<input>` without label: wrap in `<label>` or `aria-label`.
- Headings out of order: ensure each page starts at h1, sections h2, cards h3.

- [ ] **Step 4: Run all tests + typecheck + lint**

```bash
cd apps/web && npm test && npm run typecheck && npm run lint
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/main.tsx apps/web/src/
git commit -m "chore(ui): wire axe-core in dev + fix a11y violations on signature pages"
```

---

## Task 3: Lighthouse a11y audit

**Files:**
- Create: `apps/web/scripts/lighthouse.sh`

- [ ] **Step 1: Create the audit script**

```bash
# apps/web/scripts/lighthouse.sh
#!/usr/bin/env bash
# Run Lighthouse a11y audit against the dev server for each signature page.
# Requires: npm install -g lighthouse (or use npx)

set -euo pipefail

PAGES=(
	"http://localhost:5173/"
	"http://localhost:5173/employees"
	"http://localhost:5173/leave/me"
	"http://localhost:5173/approvals"
	"http://localhost:5173/me/profile"
)

REPORTS_DIR="$(dirname "$0")/../lighthouse-reports"
mkdir -p "$REPORTS_DIR"

for url in "${PAGES[@]}"; do
	name="$(echo "$url" | sed 's|.*//||; s|/|_|g; s|^_||; s|_$||')"
	[ -z "$name" ] && name="root"
	echo "→ auditing $url"
	npx lighthouse "$url" \
		--only-categories=accessibility \
		--output=json,html \
		--output-path="$REPORTS_DIR/$name" \
		--chrome-flags="--headless" \
		--quiet
	score=$(node -e "console.log(Math.round(require('$REPORTS_DIR/$name.report.json').categories.accessibility.score * 100))")
	echo "    a11y score: $score"
	if [ "$score" -lt 95 ]; then
		echo "    ✗ Below 95 — see $REPORTS_DIR/$name.report.html"
		exit 1
	fi
done

echo "✓ All signature pages ≥ 95 a11y."
```

```bash
chmod +x apps/web/scripts/lighthouse.sh
```

- [ ] **Step 2: Add gitignore entry for reports**

```bash
echo "apps/web/lighthouse-reports/" >> apps/web/.gitignore
```

- [ ] **Step 3: Run the audit**

In one terminal:
```bash
cd apps/web && npm run dev
```

In another (after the dev server is reachable):
```bash
cd /home/universal/Claude/HR_Management && apps/web/scripts/lighthouse.sh
```

Expected output: every page reports a11y ≥ 95. If a page fails:
- Open the corresponding `.report.html` in a browser to see the specific failures.
- Fix in the page or component code.
- Re-run.

(You can stop the dev server after the script exits cleanly.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/scripts/lighthouse.sh apps/web/.gitignore
git commit -m "chore(ui): add Lighthouse a11y audit script for signature pages"
```

---

## Task 4: Cleanup, version bump, CHANGELOG, tag

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/api/pyproject.toml`
- Modify: `apps/api/hrms_api/settings/base.py`
- Modify: `CHANGELOG.md`
- Various deletions across `apps/web/src/`

- [ ] **Step 1: Find and remove dead code**

```bash
# Look for old TopBar-only nav references that have been superseded by Sidebar:
grep -rn "useCan(\"leave:request:create:self\")" apps/web/src/components/shell/TopBar.tsx || true
```

If anything inside `TopBar.tsx` still has the old per-link visibility blocks (`{canLeave && <Link …>}`), remove them — they're now in the sidebar. The new TopBar is just breadcrumb + ⌘K + actions + UserMenu.

Also delete any unused inline-style ad-hoc pills/badges that have been replaced by `<StatusPill>`:

```bash
grep -rn 'rounded-full.*bg-' apps/web/src/modules --include='*.tsx' | grep -v components/hrms | head -20
```

For each match: if the styling matches a `<StatusPill>` tone, replace with the component. If it's something genuinely page-specific (e.g., a category swatch), leave it.

(This step is exploratory cleanup — bound the scope to ~30 minutes; we don't need a perfect codebase, just no obvious dead nav links.)

- [ ] **Step 2: Bump versions to 1.1.0**

```bash
cd apps/web && npm version 1.1.0 --no-git-tag-version
```

In `apps/api/pyproject.toml`, change:
```toml
version = "1.0.0"
```
to:
```toml
version = "1.1.0"
```

In `apps/api/hrms_api/settings/base.py`, find `SPECTACULAR_SETTINGS` and update:
```python
SPECTACULAR_SETTINGS = {
    "TITLE": "HRMS API",
    "VERSION": "1.1.0",
    # ...
}
```

- [ ] **Step 3: Update CHANGELOG**

Add a new entry at the top of `CHANGELOG.md`:

```markdown
## [1.1.0] - 2026-04-28

### Added
- Dark-themed sidebar shell with grouped Personal / Team / Admin nav.
- Design token system: violet accent + 6 pastels + Inter / JetBrains Mono fonts.
- 21 shadcn/ui primitives (themed) under `apps/web/src/components/ui/`.
- 13 HRMS composed components under `apps/web/src/components/hrms/` (KpiTile, EmployeeCard, DataTable, DetailPanel, DonutChart, ProgressBar, ApprovalActionBar, ClockInOutWidget, AttendanceLogRow, FileUploader, NotificationCard, EmptyState, StatusPill).
- Redesigned signature pages: Dashboard (3 variants), Employees directory, Leave, Unified Approvals inbox, My Profile.
- ⌘K command palette with page nav, employee fuzzy search, and quick actions.
- axe-core a11y checks running in dev mode.
- Lighthouse audit script verifying ≥ 95 a11y on every signature page.

### Changed
- TopBar reduced to breadcrumb + ⌘K + notifications + user menu (links moved to sidebar).
- AppShell layout switched from light theme top-bar-only to dark sidebar + topbar grid.

### Spec / plan
- Spec: `docs/superpowers/specs/2026-04-28-hrms-ui-redesign.md`
- Plans: `docs/superpowers/plans/2026-04-28-hrms-ui-{roadmap,foundation,components,pages,polish}.md`
```

- [ ] **Step 4: Final full-stack test pass**

Backend:
```bash
cd apps/api && uv run pytest 2>&1 | tail -3
```
Expected: PASS, 447 / 2 skipped (no backend changes were made by this redesign).

Frontend:
```bash
cd apps/web && npm test
cd apps/web && npm run typecheck
cd apps/web && npm run lint
cd apps/web && npm run build
```
Expected: ALL PASS, build emits dist/.

- [ ] **Step 5: Commit + tag**

```bash
cd /home/universal/Claude/HR_Management

git add apps/web/package.json apps/api/pyproject.toml apps/api/hrms_api/settings/base.py CHANGELOG.md
# also stage any cleanup deletions you made in step 1:
git add -A apps/web/src

git commit -m "chore(ui): cleanup dead nav, bump versions, CHANGELOG for v1.1.0"
git tag -a v1.1.0 -m "HRMS UI/UX redesign — Design_1 themes + Design_2 UX, sidebar shell + 5 signature pages"
```

- [ ] **Step 6: Verify the tag**

```bash
git tag -l "v*" | sort -V | tail -3
```

Expected: shows `v0.1.0-m11`, `v1.0.0`, `v1.1.0`.

```bash
git log --oneline -5
```

Expected: most recent 5 commits include the cleanup/version bump and the polish/cleanup work.

---

## Acceptance for Sub-plan 4

- [ ] ⌘K command palette opens with Pages + Employees + Actions groups; typing filters; Enter navigates.
- [ ] axe-core runs in dev mode and the console is clean on every signature page.
- [ ] `apps/web/scripts/lighthouse.sh` exits 0 — every signature page reports ≥ 95 a11y.
- [ ] Old TopBar-only nav is gone; CHANGELOG mentions the redesign.
- [ ] Version bumped to 1.1.0 across web `package.json`, api `pyproject.toml`, and `SPECTACULAR_SETTINGS`.
- [ ] Backend tests still 447 passing / 2 skipped.
- [ ] Frontend tests ≥ 60 passing.
- [ ] `git tag -l "v*"` shows `v1.1.0`.

---

## Done

When all four sub-plans are green and `v1.1.0` is tagged, the redesign is shipped. Provintell users get a dark sidebar shell, redesigned dashboard / employees / leave / approvals / profile pages, ⌘K palette, and a verifiable a11y baseline.

To deploy: follow `docs/runbooks/deploy-prod.md`. The redesign is frontend-only; backend `v1.0.0` images can stay running while the new web container rolls.
