# HRMS UI Composed Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 14 HRMS-specific composed components from spec §4.2, each with co-located tests. No pages are changed by this sub-plan — pages get rewired in Sub-plan 3.

**Architecture:** All composed components live under `apps/web/src/components/hrms/`. They sit on top of the shadcn primitives in `apps/web/src/components/ui/` and consume the design tokens from Sub-plan 1. Each component is one file plus one test file. The barrel re-export at `apps/web/src/components/hrms/index.ts` keeps imports tidy.

**Tech Stack:** React 18 · TypeScript 5.4 · Tailwind 3.4 · shadcn/ui (Button, Avatar, Sheet, Progress, etc.) · class-variance-authority · vitest · @testing-library/react · @testing-library/user-event · lucide-react.

**Spec reference:** `docs/superpowers/specs/2026-04-28-hrms-ui-redesign.md` §4.2 (composed components), §1.3 (pastel tokens), §5 (motion + a11y).

**Pre-requisite:** Sub-plan 1 (`2026-04-28-hrms-ui-foundation.md`) must be complete — design tokens, shadcn primitives, AppShell shell.

---

## File map

| Action | Path | Component |
|--------|------|-----------|
| Create | `apps/web/src/components/hrms/StatusPill.tsx` + `.test.tsx` | Task 1 |
| Create | `apps/web/src/components/hrms/KpiTile.tsx` + `.test.tsx` | Task 2 |
| Create | `apps/web/src/components/hrms/ProgressBar.tsx` + `.test.tsx` | Task 3 |
| Create | `apps/web/src/components/hrms/EmployeeCard.tsx` + `.test.tsx` | Task 4 |
| Create | `apps/web/src/components/hrms/EmptyState.tsx` + `.test.tsx` | Task 5 |
| Create | `apps/web/src/components/hrms/DataTable.tsx` + `.test.tsx` | Task 6 |
| Create | `apps/web/src/components/hrms/DetailPanel.tsx` + `.test.tsx` | Task 7 |
| Create | `apps/web/src/components/hrms/DonutChart.tsx` + `.test.tsx` | Task 8 |
| Create | `apps/web/src/components/hrms/ApprovalActionBar.tsx` + `.test.tsx` | Task 9 |
| Create | `apps/web/src/components/hrms/AttendanceLogRow.tsx` + `.test.tsx` | Task 10 |
| Create | `apps/web/src/components/hrms/ClockInOutWidget.tsx` + `.test.tsx` | Task 11 |
| Create | `apps/web/src/components/hrms/FileUploader.tsx` + `.test.tsx` | Task 12 |
| Create | `apps/web/src/components/hrms/NotificationCard.tsx` + `.test.tsx` | Task 13 |
| Create | `apps/web/src/components/hrms/index.ts` | Task 14 (barrel + final wire-up) |

---

## Task 1: StatusPill

**Files:**
- Create: `apps/web/src/components/hrms/StatusPill.tsx`
- Test: `apps/web/src/components/hrms/StatusPill.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/StatusPill.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
	it("renders the label", () => {
		render(<StatusPill tone="mint" label="Approved" />);
		expect(screen.getByText("Approved")).toBeInTheDocument();
	});

	it("applies tone-specific classes", () => {
		const { container } = render(<StatusPill tone="coral" label="Rejected" />);
		const pill = container.firstElementChild as HTMLElement;
		expect(pill.className).toMatch(/coral/);
	});

	it("renders icon when given", () => {
		render(<StatusPill tone="yellow" label="Pending" icon="⏳" />);
		expect(screen.getByText(/⏳/)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/StatusPill.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/hrms/StatusPill.tsx
import { type VariantProps, cva } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const pillVariants = cva(
	"inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-small font-semibold",
	{
		variants: {
			tone: {
				mint: "bg-mint/15 text-mint",
				yellow: "bg-yellow/15 text-yellow",
				coral: "bg-coral/15 text-coral",
				sky: "bg-sky/15 text-sky",
				lavender: "bg-lavender/15 text-lavender",
				peach: "bg-peach/15 text-peach",
			},
		},
		defaultVariants: { tone: "lavender" },
	},
);

export interface StatusPillProps extends VariantProps<typeof pillVariants> {
	label: string;
	icon?: ReactNode;
	className?: string;
}

export function StatusPill({ tone, label, icon, className }: StatusPillProps) {
	return (
		<span className={cn(pillVariants({ tone }), className)}>
			{icon && <span aria-hidden>{icon}</span>}
			<span>{label}</span>
		</span>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/StatusPill.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/StatusPill.tsx apps/web/src/components/hrms/StatusPill.test.tsx
git commit -m "feat(ui): StatusPill — 6 semantic tones with optional icon"
```

---

## Task 2: KpiTile

**Files:**
- Create: `apps/web/src/components/hrms/KpiTile.tsx`
- Test: `apps/web/src/components/hrms/KpiTile.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/KpiTile.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiTile } from "./KpiTile";

describe("KpiTile", () => {
	it("renders label and value", () => {
		render(<KpiTile tone="mint" label="Attendance" value="98%" />);
		expect(screen.getByText("Attendance")).toBeInTheDocument();
		expect(screen.getByText("98%")).toBeInTheDocument();
	});

	it("renders delta when given", () => {
		render(<KpiTile tone="peach" label="Annual leave" value="14 d" delta="+2 carried" />);
		expect(screen.getByText("+2 carried")).toBeInTheDocument();
	});

	it("renders icon character in the circle", () => {
		render(<KpiTile tone="yellow" label="Open KPIs" value="3" icon="3" />);
		expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(2); // value + icon
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/KpiTile.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/hrms/KpiTile.tsx
import { type VariantProps, cva } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const circleVariants = cva(
	"size-9 rounded-full grid place-items-center font-bold text-h3 text-canvas shrink-0",
	{
		variants: {
			tone: {
				peach: "bg-peach",
				lavender: "bg-lavender",
				mint: "bg-mint",
				yellow: "bg-yellow",
				coral: "bg-coral",
				sky: "bg-sky",
			},
		},
		defaultVariants: { tone: "lavender" },
	},
);

export interface KpiTileProps extends VariantProps<typeof circleVariants> {
	label: string;
	value: ReactNode;
	delta?: string;
	icon?: ReactNode;
}

export function KpiTile({ tone, label, value, delta, icon }: KpiTileProps) {
	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg px-3.5 py-3 flex items-center gap-2.5">
			<span className={cn(circleVariants({ tone }))} aria-hidden>
				{icon}
			</span>
			<div className="min-w-0">
				<p className="text-label text-text-tertiary truncate">{label}</p>
				<p className="text-h2 text-text-primary leading-none mt-0.5">{value}</p>
				{delta && <p className="text-small text-mint mt-0.5">{delta}</p>}
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/KpiTile.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/KpiTile.tsx apps/web/src/components/hrms/KpiTile.test.tsx
git commit -m "feat(ui): KpiTile — pastel-circle + label + value + delta"
```

---

## Task 3: ProgressBar

**Files:**
- Create: `apps/web/src/components/hrms/ProgressBar.tsx`
- Test: `apps/web/src/components/hrms/ProgressBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/ProgressBar.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
	it("renders label and percentage", () => {
		render(<ProgressBar label="Attendance" value={88} max={100} />);
		expect(screen.getByText("Attendance")).toBeInTheDocument();
		expect(screen.getByText("88%")).toBeInTheDocument();
	});

	it("clamps over-100 values", () => {
		render(<ProgressBar value={150} max={100} />);
		const bar = screen.getByRole("progressbar");
		expect(bar.getAttribute("aria-valuenow")).toBe("100");
	});

	it("clamps negative values to 0", () => {
		render(<ProgressBar value={-5} max={100} />);
		const bar = screen.getByRole("progressbar");
		expect(bar.getAttribute("aria-valuenow")).toBe("0");
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/ProgressBar.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/hrms/ProgressBar.tsx
import { cn } from "@/lib/utils";

export interface ProgressBarProps {
	value: number;
	max?: number;
	label?: string;
	gradient?: [string, string]; // tailwind colour names, e.g. ["peach", "coral"]
	showValue?: boolean;
	className?: string;
}

export function ProgressBar({
	value,
	max = 100,
	label,
	gradient = ["accent-500", "lavender"],
	showValue = true,
	className,
}: ProgressBarProps) {
	const clamped = Math.max(0, Math.min(value, max));
	const pct = (clamped / max) * 100;
	const [from, to] = gradient;

	return (
		<div className={className}>
			{(label || showValue) && (
				<div className="flex justify-between text-small text-text-tertiary mb-1">
					{label && <span>{label}</span>}
					{showValue && <span>{Math.round(pct)}%</span>}
				</div>
			)}
			<div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
				<div
					role="progressbar"
					aria-valuenow={clamped}
					aria-valuemin={0}
					aria-valuemax={max}
					aria-label={label}
					className={cn("h-full rounded-full bg-gradient-to-r", `from-${from}`, `to-${to}`)}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/ProgressBar.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/ProgressBar.tsx apps/web/src/components/hrms/ProgressBar.test.tsx
git commit -m "feat(ui): ProgressBar — gradient fill, value clamping, a11y"
```

---

## Task 4: EmployeeCard

**Files:**
- Create: `apps/web/src/components/hrms/EmployeeCard.tsx`
- Test: `apps/web/src/components/hrms/EmployeeCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/EmployeeCard.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmployeeCard } from "./EmployeeCard";

const employee = {
	id: "1",
	full_name: "Ops Lead",
	role_title: "SOC Lead",
	email: "ops@provintell.local",
	phone: "+60 12 345 6789",
};

describe("EmployeeCard", () => {
	it("renders name and role", () => {
		render(<EmployeeCard employee={employee} metric={{ label: "Attendance", value: 98, max: 100 }} />);
		expect(screen.getByText("Ops Lead")).toBeInTheDocument();
		expect(screen.getByText("SOC Lead")).toBeInTheDocument();
	});

	it("calls onView when view icon is clicked", async () => {
		const user = userEvent.setup();
		const onView = vi.fn();
		render(
			<EmployeeCard
				employee={employee}
				metric={{ label: "Attendance", value: 98, max: 100 }}
				onView={onView}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /view profile/i }));
		expect(onView).toHaveBeenCalledWith(employee.id);
	});

	it("renders metric label and value", () => {
		render(<EmployeeCard employee={employee} metric={{ label: "Attendance", value: 98, max: 100 }} />);
		expect(screen.getByText(/Attendance/)).toBeInTheDocument();
		expect(screen.getByText("98%")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/EmployeeCard.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/hrms/EmployeeCard.tsx
import { Eye, Mail, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ProgressBar } from "./ProgressBar";

export interface EmployeeCardProps {
	employee: {
		id: string;
		full_name: string;
		role_title?: string;
		email?: string;
		phone?: string;
	};
	metric: { label: string; value: number; max?: number };
	gradient?: [string, string]; // for avatar bg + bar
	onView?: (id: string) => void;
	onMail?: (email: string) => void;
	onCall?: (phone: string) => void;
}

function gradientFromName(name: string): [string, string] {
	const palettes: [string, string][] = [
		["peach", "coral"],
		["lavender", "sky"],
		["mint", "yellow"],
		["yellow", "peach"],
		["sky", "lavender"],
	];
	let hash = 0;
	for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	return palettes[hash % palettes.length] ?? ["lavender", "sky"];
}

export function EmployeeCard({
	employee,
	metric,
	gradient,
	onView,
	onMail,
	onCall,
}: EmployeeCardProps) {
	const [from, to] = gradient ?? gradientFromName(employee.full_name);

	return (
		<article className="bg-surface-hover border border-border-subtle rounded-lg p-4 text-center">
			<div
				className={cn(
					"size-14 rounded-full mx-auto mb-2 bg-gradient-to-br border-2 border-accent-500/30",
					`from-${from}`,
					`to-${to}`,
				)}
				aria-hidden
			/>
			<h3 className="text-h3 text-text-primary">{employee.full_name}</h3>
			{employee.role_title && (
				<span className="inline-block mt-1 mb-2 px-2 py-0.5 rounded-full bg-accent-500/15 text-accent-200 text-small">
					{employee.role_title}
				</span>
			)}
			<div className="flex justify-center gap-2 mb-3">
				<Button
					variant="ghost"
					size="icon"
					className="size-6 rounded-full bg-canvas border border-border-subtle"
					aria-label="Email"
					disabled={!employee.email}
					onClick={() => employee.email && onMail?.(employee.email)}
				>
					<Mail className="size-3" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-6 rounded-full bg-canvas border border-border-subtle"
					aria-label="Call"
					disabled={!employee.phone}
					onClick={() => employee.phone && onCall?.(employee.phone)}
				>
					<Phone className="size-3" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-6 rounded-full bg-canvas border border-border-subtle"
					aria-label="View profile"
					onClick={() => onView?.(employee.id)}
				>
					<Eye className="size-3" />
				</Button>
			</div>
			<ProgressBar
				label={`${metric.label} · ${Math.round((metric.value / (metric.max ?? 100)) * 100)}%`}
				value={metric.value}
				max={metric.max}
				gradient={[from, to]}
				showValue={false}
			/>
		</article>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/EmployeeCard.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/EmployeeCard.tsx apps/web/src/components/hrms/EmployeeCard.test.tsx
git commit -m "feat(ui): EmployeeCard — gradient avatar, role pill, quick actions, attendance bar"
```

---

## Task 5: EmptyState

**Files:**
- Create: `apps/web/src/components/hrms/EmptyState.tsx`
- Test: `apps/web/src/components/hrms/EmptyState.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/EmptyState.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
	it("renders title and description", () => {
		render(
			<EmptyState
				icon="🌴"
				title="No leave requests yet"
				description="Apply for your first leave to see it here."
			/>,
		);
		expect(screen.getByText("No leave requests yet")).toBeInTheDocument();
		expect(screen.getByText(/Apply for your first leave/)).toBeInTheDocument();
	});

	it("renders the action button slot", () => {
		render(
			<EmptyState
				icon="🌴"
				title="Empty"
				description="Try adding one"
				action={<button type="button">Add</button>}
			/>,
		);
		expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/EmptyState.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/hrms/EmptyState.tsx
import type { ReactNode } from "react";

export interface EmptyStateProps {
	icon: ReactNode;
	title: string;
	description?: string;
	action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
	return (
		<div className="bg-surface-hover border border-dashed border-border-subtle rounded-lg p-8 text-center text-text-tertiary">
			<div
				className="size-12 rounded-full bg-accent-500/10 text-accent-200 grid place-items-center text-h2 mx-auto mb-2.5"
				aria-hidden
			>
				{icon}
			</div>
			<h3 className="text-h3 text-text-primary">{title}</h3>
			{description && <p className="text-body mt-1">{description}</p>}
			{action && <div className="mt-3">{action}</div>}
		</div>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/EmptyState.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/EmptyState.tsx apps/web/src/components/hrms/EmptyState.test.tsx
git commit -m "feat(ui): EmptyState — icon + title + description + optional action"
```

---

## Task 6: DataTable

**Files:**
- Create: `apps/web/src/components/hrms/DataTable.tsx`
- Test: `apps/web/src/components/hrms/DataTable.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/DataTable.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTable, type Column } from "./DataTable";

interface Row { id: string; name: string; days: number; }
const rows: Row[] = [
	{ id: "1", name: "Ops Lead", days: 3 },
	{ id: "2", name: "Eng Lead", days: 1 },
];
const columns: Column<Row>[] = [
	{ key: "name", header: "Name", render: (r) => r.name },
	{ key: "days", header: "Days", render: (r) => `${r.days}d`, sortable: true },
];

describe("DataTable", () => {
	it("renders header row and data rows", () => {
		render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />);
		expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
		expect(screen.getByText("Ops Lead")).toBeInTheDocument();
		expect(screen.getByText("Eng Lead")).toBeInTheDocument();
	});

	it("calls onRowClick when a row is clicked", async () => {
		const user = userEvent.setup();
		const onRowClick = vi.fn();
		render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} onRowClick={onRowClick} />);
		await user.click(screen.getByText("Ops Lead"));
		expect(onRowClick).toHaveBeenCalledWith(rows[0]);
	});

	it("renders empty state when rows is []", () => {
		render(
			<DataTable
				rows={[]}
				columns={columns}
				rowKey={(r) => r.id}
				emptyState={<p>No data</p>}
			/>,
		);
		expect(screen.getByText("No data")).toBeInTheDocument();
	});

	it("toggles sort when sortable column header is clicked", async () => {
		const user = userEvent.setup();
		render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />);
		await user.click(screen.getByRole("button", { name: /Days/ }));
		const cells = screen.getAllByText(/d$/);
		// after asc sort, "1d" first, "3d" second
		expect(cells[0]?.textContent).toBe("1d");
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/DataTable.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/hrms/DataTable.tsx
import { ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export interface Column<T> {
	key: string;
	header: ReactNode;
	render: (row: T) => ReactNode;
	sortable?: boolean;
	sortValue?: (row: T) => number | string;
	width?: string;
	align?: "left" | "right" | "center";
}

export interface DataTableProps<T> {
	rows: T[];
	columns: Column<T>[];
	rowKey: (row: T) => string;
	onRowClick?: (row: T) => void;
	emptyState?: ReactNode;
	className?: string;
}

export function DataTable<T>({
	rows,
	columns,
	rowKey,
	onRowClick,
	emptyState,
	className,
}: DataTableProps<T>) {
	const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

	const sorted = useMemo(() => {
		if (!sort) return rows;
		const col = columns.find((c) => c.key === sort.key);
		if (!col) return rows;
		const getValue = col.sortValue ?? ((r: T) => String(col.render(r)));
		return [...rows].sort((a, b) => {
			const va = getValue(a);
			const vb = getValue(b);
			if (va < vb) return sort.dir === "asc" ? -1 : 1;
			if (va > vb) return sort.dir === "asc" ? 1 : -1;
			return 0;
		});
	}, [rows, columns, sort]);

	if (rows.length === 0 && emptyState) {
		return <div className={className}>{emptyState}</div>;
	}

	return (
		<table className={cn("w-full text-body", className)}>
			<thead>
				<tr>
					{columns.map((col) => {
						const isSorted = sort?.key === col.key;
						const align = col.align ?? "left";
						const headerEl = col.sortable ? (
							<button
								type="button"
								className="inline-flex items-center gap-1 text-label uppercase text-text-tertiary hover:text-text-secondary"
								onClick={() =>
									setSort((s) =>
										s?.key === col.key
											? { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" }
											: { key: col.key, dir: "asc" },
									)
								}
							>
								{col.header}
								{isSorted &&
									(sort?.dir === "asc" ? (
										<ChevronUp className="size-3" />
									) : (
										<ChevronDown className="size-3" />
									))}
							</button>
						) : (
							<span className="text-label uppercase text-text-tertiary">{col.header}</span>
						);
						return (
							<th
								key={col.key}
								className={cn(
									"px-2.5 py-2 border-b border-border-subtle text-left",
									align === "right" && "text-right",
									align === "center" && "text-center",
								)}
								style={col.width ? { width: col.width } : undefined}
							>
								{headerEl}
							</th>
						);
					})}
				</tr>
			</thead>
			<tbody>
				{sorted.map((row) => (
					<tr
						key={rowKey(row)}
						className={cn(
							"border-b border-border-subtle text-text-secondary",
							onRowClick && "cursor-pointer hover:bg-surface-hover transition-colors duration-fast",
						)}
						onClick={() => onRowClick?.(row)}
					>
						{columns.map((col) => (
							<td
								key={col.key}
								className={cn(
									"px-2.5 py-2.5",
									col.align === "right" && "text-right",
									col.align === "center" && "text-center",
								)}
							>
								{col.render(row)}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/DataTable.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/DataTable.tsx apps/web/src/components/hrms/DataTable.test.tsx
git commit -m "feat(ui): DataTable — sortable columns, row-click, empty state"
```

---

## Task 7: DetailPanel

**Files:**
- Create: `apps/web/src/components/hrms/DetailPanel.tsx`
- Test: `apps/web/src/components/hrms/DetailPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/DetailPanel.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DetailPanel } from "./DetailPanel";

describe("DetailPanel", () => {
	it("does not render when closed", () => {
		render(<DetailPanel open={false} onClose={() => {}} title="Leave LR-1">body</DetailPanel>);
		expect(screen.queryByText("Leave LR-1")).not.toBeInTheDocument();
	});

	it("renders title, body, and close button when open", () => {
		render(
			<DetailPanel open={true} onClose={() => {}} title="Leave LR-1">
				<p>annual leave details</p>
			</DetailPanel>,
		);
		expect(screen.getByRole("dialog", { name: "Leave LR-1" })).toBeInTheDocument();
		expect(screen.getByText("annual leave details")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
	});

	it("calls onClose when close button is clicked", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(
			<DetailPanel open={true} onClose={onClose} title="Leave LR-1">
				body
			</DetailPanel>,
		);
		await user.click(screen.getByRole("button", { name: /close/i }));
		expect(onClose).toHaveBeenCalled();
	});

	it("calls onClose when Esc is pressed", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(
			<DetailPanel open={true} onClose={onClose} title="Leave LR-1">
				body
			</DetailPanel>,
		);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalled();
	});

	it("renders footer slot", () => {
		render(
			<DetailPanel
				open={true}
				onClose={() => {}}
				title="Leave LR-1"
				footer={<button type="button">Approve</button>}
			>
				body
			</DetailPanel>,
		);
		expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/DetailPanel.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement (using shadcn Sheet primitive)**

```tsx
// apps/web/src/components/hrms/DetailPanel.tsx
import { X } from "lucide-react";
import type { ReactNode } from "react";

import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";

export interface DetailPanelProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	footer?: ReactNode;
}

export function DetailPanel({ open, onClose, title, children, footer }: DetailPanelProps) {
	return (
		<Sheet open={open} onOpenChange={(v) => !v && onClose()}>
			<SheetContent
				side="right"
				className="bg-surface-elevated border-l border-accent-500/20 shadow-panel w-[320px] sm:max-w-[320px] flex flex-col p-0"
			>
				<SheetHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
					<SheetTitle className="text-h3 text-text-primary">{title}</SheetTitle>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="text-text-tertiary hover:text-text-primary transition-colors duration-fast"
					>
						<X className="size-4" />
					</button>
				</SheetHeader>
				<div className="flex-1 overflow-y-auto px-4 py-3 text-body text-text-secondary">
					{children}
				</div>
				{footer && (
					<footer className="px-4 py-3 border-t border-border-subtle">{footer}</footer>
				)}
			</SheetContent>
		</Sheet>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/DetailPanel.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/DetailPanel.tsx apps/web/src/components/hrms/DetailPanel.test.tsx
git commit -m "feat(ui): DetailPanel — slide-over with focus trap, Esc-to-close, footer slot"
```

---

## Task 8: DonutChart

**Files:**
- Create: `apps/web/src/components/hrms/DonutChart.tsx`
- Test: `apps/web/src/components/hrms/DonutChart.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/DonutChart.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DonutChart } from "./DonutChart";

describe("DonutChart", () => {
	it("renders centre label", () => {
		render(
			<DonutChart
				centerLabel={<><div>98%</div><div>Present</div></>}
				segments={[
					{ value: 75, color: "mint", label: "Present" },
					{ value: 15, color: "yellow", label: "Late" },
					{ value: 10, color: "coral", label: "Absent" },
				]}
			/>,
		);
		expect(screen.getByText("98%")).toBeInTheDocument();
	});

	it("renders all segment labels in legend", () => {
		render(
			<DonutChart
				centerLabel={<>x</>}
				segments={[
					{ value: 75, color: "mint", label: "Present" },
					{ value: 15, color: "yellow", label: "Late" },
					{ value: 10, color: "coral", label: "Absent" },
				]}
			/>,
		);
		expect(screen.getByText("Present")).toBeInTheDocument();
		expect(screen.getByText("Late")).toBeInTheDocument();
		expect(screen.getByText("Absent")).toBeInTheDocument();
	});

	it("renders percentage per segment in legend", () => {
		render(
			<DonutChart
				centerLabel={<>x</>}
				segments={[
					{ value: 75, color: "mint", label: "Present" },
					{ value: 25, color: "yellow", label: "Late" },
				]}
			/>,
		);
		expect(screen.getByText("75%")).toBeInTheDocument();
		expect(screen.getByText("25%")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/DonutChart.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/hrms/DonutChart.tsx
import type { ReactNode } from "react";

export interface DonutSegment {
	value: number;
	color: "mint" | "yellow" | "coral" | "lavender" | "peach" | "sky";
	label: string;
}

export interface DonutChartProps {
	segments: DonutSegment[];
	centerLabel: ReactNode;
	size?: number;
}

const COLOR_HEX: Record<DonutSegment["color"], string> = {
	mint: "#97D9C7",
	yellow: "#FCD685",
	coral: "#F4A0A0",
	lavender: "#BFB1F2",
	peach: "#FCC59A",
	sky: "#A0CFEC",
};

export function DonutChart({ segments, centerLabel, size = 90 }: DonutChartProps) {
	const total = segments.reduce((acc, s) => acc + s.value, 0);
	let cumulative = 0;
	const stops = segments.map((seg) => {
		const startDeg = (cumulative / total) * 360;
		cumulative += seg.value;
		const endDeg = (cumulative / total) * 360;
		return `${COLOR_HEX[seg.color]} ${startDeg}deg ${endDeg}deg`;
	});

	const ringStyle = {
		width: `${size}px`,
		height: `${size}px`,
		background: `conic-gradient(${stops.join(", ")})`,
	};

	return (
		<div className="flex items-center gap-4">
			<div
				className="relative rounded-full shrink-0"
				style={ringStyle}
				role="img"
				aria-label={`Donut chart: ${segments.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ")}`}
			>
				<div className="absolute inset-3.5 rounded-full bg-surface-hover" aria-hidden />
				<div className="absolute inset-0 grid place-items-center text-text-primary text-center text-h3 leading-tight">
					{centerLabel}
				</div>
			</div>
			<div className="text-small space-y-1">
				{segments.map((seg) => (
					<div key={seg.label} className="flex items-center gap-2 text-text-secondary">
						<span
							className="size-2 rounded-full shrink-0"
							style={{ background: COLOR_HEX[seg.color] }}
							aria-hidden
						/>
						<span>{seg.label}</span>
						<span className="ml-auto text-text-tertiary">
							{Math.round((seg.value / total) * 100)}%
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/DonutChart.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/DonutChart.tsx apps/web/src/components/hrms/DonutChart.test.tsx
git commit -m "feat(ui): DonutChart — pure CSS conic-gradient with legend + a11y label"
```

---

## Task 9: ApprovalActionBar

**Files:**
- Create: `apps/web/src/components/hrms/ApprovalActionBar.tsx`
- Test: `apps/web/src/components/hrms/ApprovalActionBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/ApprovalActionBar.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApprovalActionBar } from "./ApprovalActionBar";

describe("ApprovalActionBar", () => {
	it("renders Approve and Reject buttons", () => {
		render(<ApprovalActionBar onApprove={() => {}} onReject={() => {}} />);
		expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
	});

	it("calls onApprove with the comment when Approve is clicked", async () => {
		const user = userEvent.setup();
		const onApprove = vi.fn();
		render(<ApprovalActionBar onApprove={onApprove} onReject={() => {}} />);
		await user.type(screen.getByRole("textbox"), "Looks good");
		await user.click(screen.getByRole("button", { name: /approve/i }));
		expect(onApprove).toHaveBeenCalledWith("Looks good");
	});

	it("requires a comment for reject", async () => {
		const user = userEvent.setup();
		const onReject = vi.fn();
		render(<ApprovalActionBar onApprove={() => {}} onReject={onReject} requireRejectComment />);
		await user.click(screen.getByRole("button", { name: /reject/i }));
		expect(onReject).not.toHaveBeenCalled();
		expect(screen.getByText(/comment required/i)).toBeInTheDocument();
	});

	it("disables both buttons when busy", () => {
		render(<ApprovalActionBar onApprove={() => {}} onReject={() => {}} busy />);
		expect(screen.getByRole("button", { name: /approve/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /reject/i })).toBeDisabled();
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/ApprovalActionBar.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/hrms/ApprovalActionBar.tsx
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface ApprovalActionBarProps {
	onApprove: (comment: string) => void;
	onReject: (comment: string) => void;
	busy?: boolean;
	requireRejectComment?: boolean;
}

export function ApprovalActionBar({
	onApprove,
	onReject,
	busy = false,
	requireRejectComment = false,
}: ApprovalActionBarProps) {
	const [comment, setComment] = useState("");
	const [rejectError, setRejectError] = useState<string | null>(null);

	const handleReject = () => {
		if (requireRejectComment && comment.trim() === "") {
			setRejectError("Comment required to reject.");
			return;
		}
		setRejectError(null);
		onReject(comment);
	};

	return (
		<div className="flex flex-col gap-2">
			<Textarea
				value={comment}
				onChange={(e) => setComment(e.target.value)}
				placeholder="Add a comment (optional for approve, required for reject)…"
				className="bg-canvas border-border-subtle"
				rows={2}
			/>
			{rejectError && (
				<p className="text-small text-coral" role="alert">
					{rejectError}
				</p>
			)}
			<div className="flex gap-2">
				<Button
					type="button"
					onClick={() => onApprove(comment)}
					disabled={busy}
					className="flex-1 bg-accent-500 text-white hover:bg-accent-600"
				>
					Approve
				</Button>
				<Button
					type="button"
					onClick={handleReject}
					disabled={busy}
					variant="outline"
					className="flex-1 bg-canvas text-coral border-coral/30 hover:bg-coral/10"
				>
					Reject
				</Button>
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/ApprovalActionBar.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/ApprovalActionBar.tsx apps/web/src/components/hrms/ApprovalActionBar.test.tsx
git commit -m "feat(ui): ApprovalActionBar — Approve/Reject + comment + reject-comment-required guard"
```

---

## Task 10: AttendanceLogRow

**Files:**
- Create: `apps/web/src/components/hrms/AttendanceLogRow.tsx`
- Test: `apps/web/src/components/hrms/AttendanceLogRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/AttendanceLogRow.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AttendanceLogRow } from "./AttendanceLogRow";

describe("AttendanceLogRow", () => {
	it("renders name and clock-in time", () => {
		render(
			<AttendanceLogRow
				name="Ops Lead"
				clockIn="09:15"
				clockOut={null}
				status={{ tone: "mint", label: "On time" }}
			/>,
		);
		expect(screen.getByText("Ops Lead")).toBeInTheDocument();
		expect(screen.getByText(/09:15/)).toBeInTheDocument();
		expect(screen.getByText("On time")).toBeInTheDocument();
	});

	it("renders dash for missing clock-out", () => {
		render(
			<AttendanceLogRow
				name="Eng Lead"
				clockIn="09:00"
				clockOut={null}
				status={{ tone: "mint", label: "On time" }}
			/>,
		);
		expect(screen.getByText(/Out —/)).toBeInTheDocument();
	});

	it("shows late minutes when status carries them", () => {
		render(
			<AttendanceLogRow
				name="Analyst One"
				clockIn="09:35"
				clockOut={null}
				status={{ tone: "yellow", label: "Late · 5m" }}
			/>,
		);
		expect(screen.getByText(/Late · 5m/)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/AttendanceLogRow.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/hrms/AttendanceLogRow.tsx
import { cn } from "@/lib/utils";

import { StatusPill } from "./StatusPill";

export interface AttendanceLogRowProps {
	name: string;
	subtitle?: string;
	clockIn: string;
	clockOut: string | null;
	status: { tone: "mint" | "yellow" | "coral" | "lavender" | "peach" | "sky"; label: string };
	gradient?: [string, string];
}

function gradientFromName(name: string): [string, string] {
	const palettes: [string, string][] = [
		["peach", "coral"],
		["lavender", "sky"],
		["mint", "yellow"],
	];
	let h = 0;
	for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
	return palettes[h % palettes.length] ?? ["lavender", "sky"];
}

export function AttendanceLogRow({
	name,
	subtitle,
	clockIn,
	clockOut,
	status,
	gradient,
}: AttendanceLogRowProps) {
	const [from, to] = gradient ?? gradientFromName(name);
	return (
		<div className="flex items-center gap-2 py-1.5 border-b border-border-subtle last:border-b-0">
			<div
				className={cn("size-6 rounded-full bg-gradient-to-br shrink-0", `from-${from}`, `to-${to}`)}
				aria-hidden
			/>
			<div className="min-w-0 flex-1">
				<p className="text-small text-text-primary truncate">{name}</p>
				<p className="text-small text-text-tertiary">
					{subtitle ? `${subtitle} · ` : ""}In {clockIn} · Out {clockOut ?? "—"}
				</p>
			</div>
			<StatusPill tone={status.tone} label={status.label} />
		</div>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/AttendanceLogRow.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/AttendanceLogRow.tsx apps/web/src/components/hrms/AttendanceLogRow.test.tsx
git commit -m "feat(ui): AttendanceLogRow — avatar + name + in/out + status pill"
```

---

## Task 11: ClockInOutWidget

**Files:**
- Create: `apps/web/src/components/hrms/ClockInOutWidget.tsx`
- Test: `apps/web/src/components/hrms/ClockInOutWidget.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/ClockInOutWidget.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ClockInOutWidget } from "./ClockInOutWidget";

describe("ClockInOutWidget", () => {
	beforeAll(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-28T09:00:00+08:00"));
	});
	afterAll(() => {
		vi.useRealTimers();
	});

	it("shows Clock in button when not clocked in", () => {
		render(<ClockInOutWidget state={{ status: "off" }} onClockIn={() => {}} onClockOut={() => {}} />);
		expect(screen.getByRole("button", { name: /clock in/i })).toBeInTheDocument();
	});

	it("shows Clock out button when clocked in", () => {
		render(
			<ClockInOutWidget
				state={{ status: "in", since: "2026-04-28T08:30:00+08:00" }}
				onClockIn={() => {}}
				onClockOut={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: /clock out/i })).toBeInTheDocument();
	});

	it("calls onClockIn when button clicked", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const onClockIn = vi.fn();
		render(<ClockInOutWidget state={{ status: "off" }} onClockIn={onClockIn} onClockOut={() => {}} />);
		await user.click(screen.getByRole("button", { name: /clock in/i }));
		expect(onClockIn).toHaveBeenCalled();
	});

	it("displays elapsed since clock-in", () => {
		render(
			<ClockInOutWidget
				state={{ status: "in", since: "2026-04-28T08:30:00+08:00" }}
				onClockIn={() => {}}
				onClockOut={() => {}}
			/>,
		);
		expect(screen.getByText(/30 min/)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/ClockInOutWidget.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/hrms/ClockInOutWidget.tsx
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export type ClockState =
	| { status: "off" }
	| { status: "in"; since: string }
	| { status: "out"; clockedIn: string; clockedOut: string };

export interface ClockInOutWidgetProps {
	state: ClockState;
	onClockIn: () => void;
	onClockOut: () => void;
	busy?: boolean;
}

function fmtElapsed(sinceIso: string): string {
	const minutes = Math.max(0, Math.floor((Date.now() - new Date(sinceIso).getTime()) / 60000));
	if (minutes < 60) return `${minutes} min`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${h}h ${m}m`;
}

function fmtClock(date: Date): string {
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function ClockInOutWidget({ state, onClockIn, onClockOut, busy = false }: ClockInOutWidgetProps) {
	const [, setTick] = useState(0);

	useEffect(() => {
		if (state.status !== "in") return;
		const t = setInterval(() => setTick((x) => x + 1), 60000);
		return () => clearInterval(t);
	}, [state.status]);

	const now = new Date();
	const elapsed = state.status === "in" ? fmtElapsed(state.since) : null;

	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<div className="flex items-baseline justify-between mb-3">
				<span className="text-label uppercase text-text-tertiary">Clock in / out</span>
				<span className="font-mono text-h3 text-text-primary">{fmtClock(now)}</span>
			</div>
			{state.status === "off" && (
				<Button
					type="button"
					onClick={onClockIn}
					disabled={busy}
					className="w-full bg-accent-500 hover:bg-accent-600 text-white h-12 text-h2"
				>
					Clock in
				</Button>
			)}
			{state.status === "in" && (
				<>
					<p className="text-small text-text-secondary mb-2">
						Working for <span className="text-mint font-semibold">{elapsed}</span>
					</p>
					<Button
						type="button"
						onClick={onClockOut}
						disabled={busy}
						variant="outline"
						className="w-full border-coral/30 text-coral hover:bg-coral/10 h-12 text-h2"
					>
						Clock out
					</Button>
				</>
			)}
			{state.status === "out" && (
				<p className="text-body text-text-secondary">
					Done for the day. In: <span className="font-mono">{state.clockedIn}</span> · Out:{" "}
					<span className="font-mono">{state.clockedOut}</span>
				</p>
			)}
		</div>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/ClockInOutWidget.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/ClockInOutWidget.tsx apps/web/src/components/hrms/ClockInOutWidget.test.tsx
git commit -m "feat(ui): ClockInOutWidget — big primary button with current time and elapsed"
```

---

## Task 12: FileUploader

**Files:**
- Create: `apps/web/src/components/hrms/FileUploader.tsx`
- Test: `apps/web/src/components/hrms/FileUploader.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/FileUploader.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileUploader } from "./FileUploader";

describe("FileUploader", () => {
	it("renders drop zone with helper text", () => {
		render(
			<FileUploader
				accept="application/pdf"
				maxSize={5_000_000}
				getPresignedUpload={async () => ({ url: "x", fields: {}, key: "y" })}
				onUploaded={() => {}}
			/>,
		);
		expect(screen.getByText(/Drop a file here/i)).toBeInTheDocument();
	});

	it("rejects oversize files", async () => {
		const user = userEvent.setup();
		render(
			<FileUploader
				accept="application/pdf"
				maxSize={1000}
				getPresignedUpload={async () => ({ url: "x", fields: {}, key: "y" })}
				onUploaded={() => {}}
			/>,
		);
		const input = screen.getByLabelText(/upload/i) as HTMLInputElement;
		const big = new File(["x".repeat(2000)], "big.pdf", { type: "application/pdf" });
		await user.upload(input, big);
		expect(screen.getByText(/File is too large/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/FileUploader.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/hrms/FileUploader.tsx
import { Upload, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PresignedUpload {
	url: string;
	fields: Record<string, string>;
	key: string; // S3 object key returned to caller
}

export interface FileUploaderProps {
	accept: string;
	maxSize: number;
	getPresignedUpload: (file: File) => Promise<PresignedUpload>;
	onUploaded: (key: string, file: File) => void;
}

export function FileUploader({ accept, maxSize, getPresignedUpload, onUploaded }: FileUploaderProps) {
	const inputId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState<string | null>(null);

	const handle = async (file: File) => {
		setError(null);
		if (file.size > maxSize) {
			setError(`File is too large. Max ${(maxSize / 1024 / 1024).toFixed(1)} MB.`);
			return;
		}
		setBusy(true);
		try {
			const presigned = await getPresignedUpload(file);
			const form = new FormData();
			for (const [k, v] of Object.entries(presigned.fields)) form.append(k, v);
			form.append("file", file);
			const resp = await fetch(presigned.url, { method: "POST", body: form });
			if (!resp.ok) throw new Error(`Upload failed (${resp.status})`);
			setDone(file.name);
			onUploaded(presigned.key, file);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Upload failed");
		} finally {
			setBusy(false);
		}
	};

	if (done) {
		return (
			<div className="flex items-center gap-2 bg-surface-hover border border-border-subtle rounded-md p-2.5">
				<span className="text-small text-text-secondary truncate flex-1">{done}</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => {
						setDone(null);
						if (inputRef.current) inputRef.current.value = "";
					}}
					aria-label="Remove file"
				>
					<X className="size-4" />
				</Button>
			</div>
		);
	}

	return (
		<div>
			<label
				htmlFor={inputId}
				className={cn(
					"flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border-subtle rounded-lg p-6 cursor-pointer hover:border-accent-500/50 transition-colors duration-fast",
					busy && "opacity-50 pointer-events-none",
				)}
			>
				<Upload className="size-5 text-text-tertiary" aria-hidden />
				<span className="text-body text-text-secondary">
					Drop a file here or <span className="text-accent-200">browse</span>
				</span>
				<span className="text-small text-text-tertiary">
					Max {(maxSize / 1024 / 1024).toFixed(1)} MB · {accept}
				</span>
				<input
					ref={inputRef}
					id={inputId}
					type="file"
					accept={accept}
					className="sr-only"
					aria-label="Upload"
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) void handle(f);
					}}
				/>
			</label>
			{error && (
				<p className="text-small text-coral mt-2" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/FileUploader.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/FileUploader.tsx apps/web/src/components/hrms/FileUploader.test.tsx
git commit -m "feat(ui): FileUploader — drag-drop, size validation, S3 presigned POST"
```

---

## Task 13: NotificationCard

**Files:**
- Create: `apps/web/src/components/hrms/NotificationCard.tsx`
- Test: `apps/web/src/components/hrms/NotificationCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/hrms/NotificationCard.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotificationCard } from "./NotificationCard";

const notif = {
	id: "n1",
	type: "leave_approved",
	title: "Leave approved",
	body: "Your annual leave for 10 May was approved.",
	created_at: "2026-04-28T09:00:00Z",
	read_at: null as string | null,
	deep_link: "/leave/me",
};

describe("NotificationCard", () => {
	it("renders title and body", () => {
		render(<NotificationCard notification={notif} onRead={() => {}} />);
		expect(screen.getByText("Leave approved")).toBeInTheDocument();
		expect(screen.getByText(/Your annual leave/)).toBeInTheDocument();
	});

	it("shows unread dot when read_at is null", () => {
		render(<NotificationCard notification={notif} onRead={() => {}} />);
		expect(screen.getByLabelText(/unread/i)).toBeInTheDocument();
	});

	it("hides unread dot when read", () => {
		render(<NotificationCard notification={{ ...notif, read_at: "2026-04-28T10:00:00Z" }} onRead={() => {}} />);
		expect(screen.queryByLabelText(/unread/i)).not.toBeInTheDocument();
	});

	it("calls onRead when clicked", async () => {
		const user = userEvent.setup();
		const onRead = vi.fn();
		render(<NotificationCard notification={notif} onRead={onRead} />);
		await user.click(screen.getByRole("button", { name: /Leave approved/i }));
		expect(onRead).toHaveBeenCalledWith("n1");
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/hrms/NotificationCard.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/hrms/NotificationCard.tsx
import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";

export interface NotificationDTO {
	id: string;
	type: string; // e.g. leave_approved, claim_rejected, cert_expiring
	title: string;
	body: string;
	created_at: string;
	read_at: string | null;
	deep_link?: string;
}

export interface NotificationCardProps {
	notification: NotificationDTO;
	onRead: (id: string) => void;
}

const TYPE_TONE: Record<string, string> = {
	leave_approved: "bg-mint/15 text-mint",
	leave_rejected: "bg-coral/15 text-coral",
	claim_approved: "bg-mint/15 text-mint",
	claim_rejected: "bg-coral/15 text-coral",
	cert_expiring: "bg-yellow/15 text-yellow",
	approval_requested: "bg-peach/15 text-peach",
	system: "bg-sky/15 text-sky",
};

function timeAgo(iso: string): string {
	const diffMs = Date.now() - new Date(iso).getTime();
	const m = Math.floor(diffMs / 60000);
	if (m < 1) return "just now";
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h`;
	return `${Math.floor(h / 24)}d`;
}

export function NotificationCard({ notification, onRead }: NotificationCardProps) {
	const nav = useNavigate();
	const tone = TYPE_TONE[notification.type] ?? TYPE_TONE.system;
	const unread = !notification.read_at;

	const click = () => {
		onRead(notification.id);
		if (notification.deep_link) nav(notification.deep_link);
	};

	return (
		<button
			type="button"
			onClick={click}
			className={cn(
				"flex w-full items-start gap-3 px-3 py-2.5 rounded-md text-left transition-colors duration-fast",
				"hover:bg-surface-hover focus-visible:bg-surface-hover",
			)}
			aria-label={notification.title}
		>
			<span
				className={cn("size-7 rounded-full grid place-items-center text-small font-bold shrink-0", tone)}
				aria-hidden
			>
				●
			</span>
			<div className="flex-1 min-w-0">
				<p className="text-h3 text-text-primary truncate">{notification.title}</p>
				<p className="text-small text-text-tertiary truncate">{notification.body}</p>
			</div>
			<div className="flex flex-col items-end gap-1 shrink-0">
				<span className="text-small text-text-tertiary">{timeAgo(notification.created_at)}</span>
				{unread && (
					<span
						className="size-2 rounded-full bg-peach"
						aria-label="Unread notification"
					/>
				)}
			</div>
		</button>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/hrms/NotificationCard.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hrms/NotificationCard.tsx apps/web/src/components/hrms/NotificationCard.test.tsx
git commit -m "feat(ui): NotificationCard — type tone + relative time + unread dot"
```

---

## Task 14: Barrel export and full-suite verification

**Files:**
- Create: `apps/web/src/components/hrms/index.ts`

- [ ] **Step 1: Create barrel**

```ts
// apps/web/src/components/hrms/index.ts
export { ApprovalActionBar } from "./ApprovalActionBar";
export type { ApprovalActionBarProps } from "./ApprovalActionBar";
export { AttendanceLogRow } from "./AttendanceLogRow";
export type { AttendanceLogRowProps } from "./AttendanceLogRow";
export { ClockInOutWidget } from "./ClockInOutWidget";
export type { ClockInOutWidgetProps, ClockState } from "./ClockInOutWidget";
export { DataTable } from "./DataTable";
export type { Column, DataTableProps } from "./DataTable";
export { DetailPanel } from "./DetailPanel";
export type { DetailPanelProps } from "./DetailPanel";
export { DonutChart } from "./DonutChart";
export type { DonutChartProps, DonutSegment } from "./DonutChart";
export { EmployeeCard } from "./EmployeeCard";
export type { EmployeeCardProps } from "./EmployeeCard";
export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";
export { FileUploader } from "./FileUploader";
export type { FileUploaderProps, PresignedUpload } from "./FileUploader";
export { KpiTile } from "./KpiTile";
export type { KpiTileProps } from "./KpiTile";
export { NotificationCard } from "./NotificationCard";
export type { NotificationCardProps, NotificationDTO } from "./NotificationCard";
export { ProgressBar } from "./ProgressBar";
export type { ProgressBarProps } from "./ProgressBar";
export { StatusPill } from "./StatusPill";
export type { StatusPillProps } from "./StatusPill";
```

- [ ] **Step 2: Run the full hrms suite**

```bash
cd apps/web && npm test -- src/components/hrms
```

Expected: PASS (35+ tests across 13 component files).

- [ ] **Step 3: Run full project test + typecheck + lint**

```bash
cd apps/web && npm test
cd apps/web && npm run typecheck
cd apps/web && npm run lint
```

Expected: ALL PASS. Test count should now be ~45+ (10 baseline + 14 shell from Sub-plan 1 + 35+ hrms).

- [ ] **Step 4: Commit barrel**

```bash
git add apps/web/src/components/hrms/index.ts
git commit -m "chore(ui): barrel-export hrms composed components"
```

---

## Acceptance for Sub-plan 2

- [ ] All 13 composed component files exist with passing co-located tests.
- [ ] `apps/web/src/components/hrms/index.ts` re-exports each component + its props type.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] No page has been changed yet — visual UI is identical to end of Sub-plan 1.

When green, move to Sub-plan 3 (signature pages).
