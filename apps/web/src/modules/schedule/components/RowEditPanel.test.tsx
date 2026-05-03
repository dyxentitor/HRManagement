import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RowEditPanel } from "./RowEditPanel";

const employee = {
	id: "e1",
	full_name: "Syafiq",
	employee_code: "EMP001",
	status: "active" as const,
	department_name: "L1",
	role_title: "Lead",
	team_id: "t1",
};
const shifts = [
	{
		id: "s1",
		code: "M",
		name: "Morning",
		start_time: "09:00",
		end_time: "18:00",
		color: "#7c5cff",
		crosses_midnight: false,
	},
	{
		id: "s2",
		code: "N",
		name: "Night",
		start_time: "21:00",
		end_time: "08:00",
		color: "#a0cfec",
		crosses_midnight: true,
	},
];
const baseProps = {
	open: true,
	employee,
	shifts,
	defaultRange: { from: "2026-03-01", to: "2026-03-07" },
	existingAssignments: [],
	leaves: [],
	holidays: [],
	pendingEdits: new Map<string, string | null>(),
	onDraftChange: vi.fn(),
	onCommit: vi.fn().mockResolvedValue(undefined),
	onPatternApply: vi.fn().mockResolvedValue(undefined),
	onClose: vi.fn(),
};

describe("RowEditPanel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders employee name in header", () => {
		render(<RowEditPanel {...baseProps} />);
		expect(screen.getByText("Syafiq")).toBeInTheDocument();
	});

	it("does not render when open=false", () => {
		render(<RowEditPanel {...baseProps} open={false} />);
		expect(screen.queryByText("Syafiq")).not.toBeInTheDocument();
	});

	it("renders one row per date in defaultRange", () => {
		render(<RowEditPanel {...baseProps} />);
		expect(
			screen.getAllByRole("combobox", { name: /Mar 0[1-7]/ }),
		).toHaveLength(7);
	});

	it("Save button is disabled when pendingEdits is empty", () => {
		render(<RowEditPanel {...baseProps} />);
		expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
	});

	it("Save button is enabled and shows count when pendingEdits has entries", () => {
		const pendingEdits = new Map<string, string | null>([
			["2026-03-01", "s2"],
			["2026-03-02", "s2"],
		]);
		render(<RowEditPanel {...baseProps} pendingEdits={pendingEdits} />);
		const btn = screen.getByRole("button", { name: /Save 2 changes/ });
		expect(btn).toBeEnabled();
	});

	it("changing a day dropdown calls onDraftChange with new map", async () => {
		const onDraftChange = vi.fn();
		render(<RowEditPanel {...baseProps} onDraftChange={onDraftChange} />);
		const select = screen.getByRole("combobox", { name: /Mar 03/ });
		await userEvent.selectOptions(select, "s2");
		expect(onDraftChange).toHaveBeenCalled();
		const nextMap = onDraftChange.mock.calls[0][0] as Map<
			string,
			string | null
		>;
		expect(nextMap.get("2026-03-03")).toBe("s2");
	});

	it("Save click calls onCommit", async () => {
		const onCommit = vi.fn().mockResolvedValue(undefined);
		const pendingEdits = new Map<string, string | null>([["2026-03-01", "s2"]]);
		render(
			<RowEditPanel
				{...baseProps}
				pendingEdits={pendingEdits}
				onCommit={onCommit}
			/>,
		);
		await userEvent.click(
			screen.getByRole("button", { name: /Save 1 change/ }),
		);
		expect(onCommit).toHaveBeenCalled();
	});

	it("Cancel with no pending edits calls onClose immediately", async () => {
		const onClose = vi.fn();
		render(<RowEditPanel {...baseProps} onClose={onClose} />);
		await userEvent.click(screen.getByRole("button", { name: /Cancel/ }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("Cancel with pending edits prompts confirm before closing", async () => {
		const onClose = vi.fn();
		const pendingEdits = new Map<string, string | null>([["2026-03-01", "s2"]]);
		render(
			<RowEditPanel
				{...baseProps}
				pendingEdits={pendingEdits}
				onClose={onClose}
			/>,
		);
		await userEvent.click(screen.getByRole("button", { name: /Cancel/ }));
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByText(/Discard 1 unsaved/)).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: /^Discard$/ }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("approved-leave row dropdown is disabled", () => {
		const leaves = [{ employee_id: "e1", date: "2026-03-03", type: "annual" }];
		render(<RowEditPanel {...baseProps} leaves={leaves} />);
		const select = screen.getByRole("combobox", { name: /Mar 03/ });
		expect(select).toBeDisabled();
	});

	it("inactive employee row dropdowns are all disabled", () => {
		const inactiveEmp = { ...employee, status: "terminated" as const };
		render(<RowEditPanel {...baseProps} employee={inactiveEmp} />);
		// All day-list dropdowns + all 7 pattern dropdowns are disabled
		for (const select of screen.getAllByRole("combobox")) {
			expect(select).toBeDisabled();
		}
	});

	it("pattern Apply with months=1 calls onPatternApply with confirm", async () => {
		const onPatternApply = vi.fn().mockResolvedValue(undefined);
		render(<RowEditPanel {...baseProps} onPatternApply={onPatternApply} />);
		const monSelect = screen.getByLabelText("Pattern Mon");
		await userEvent.selectOptions(monSelect, "s1");
		await userEvent.click(
			screen.getByRole("button", { name: /Apply pattern/ }),
		);
		expect(screen.getByText(/Apply pattern to/)).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: /^Apply$/ }));
		expect(onPatternApply).toHaveBeenCalled();
		const [pattern, months] = onPatternApply.mock.calls[0];
		expect(pattern).toEqual({ mon: "s1" });
		expect(months).toBe(1);
	});
});
