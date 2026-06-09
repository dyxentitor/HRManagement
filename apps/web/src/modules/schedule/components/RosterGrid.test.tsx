import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarPayload } from "../api";
import { RosterGrid } from "./RosterGrid";

const payload: CalendarPayload = {
	range: { from: "2026-03-02", to: "2026-03-08" },
	teams: [
		{
			id: "t1",
			name: "Focus",
			sort_order: 0,
			min_headcount: null,
			parent_team_id: null,
			members: [
				{
					id: "e1",
					full_name: "Syafiq",
					employee_code: "EMP001",
					status: "active",
					department_name: "L1",
					role_title: "Lead",
					team_id: "t1",
				},
				{
					id: "e2",
					full_name: "Anas",
					employee_code: "EMP002",
					status: "active",
					department_name: "L1",
					role_title: "Lead",
					team_id: "t1",
				},
			],
		},
	],
	shifts: [
		{
			id: "s1",
			code: "M",
			name: "Morning",
			start_time: "09:00",
			end_time: "18:00",
			color: "#7c5cff",
			crosses_midnight: false,
		},
	],
	assignments: [
		{
			id: "a1",
			employee_id: "e1",
			work_date: "2026-03-04",
			shift_id: "s1",
			shift_code: "M",
			covering_for_id: null,
			covering_for_name: null,
			is_published: true,
			notes: "",
		},
	],
	leaves: [],
	holidays: [],
	stats: { by_day: [], totals: { hours: 0, headcount: 0 }, coverage: [] },
};

const baseProps = {
	viewMode: "week" as const,
	payload,
	pendingEdits: new Map<string, string | null>(),
	onCellOpen: vi.fn(),
	onRowOpen: vi.fn(),
	onSelectionApply: vi.fn(),
};

describe("RosterGrid", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	it("renders teams as collapsible groups", () => {
		render(<RosterGrid {...baseProps} />);
		expect(screen.getByText(/Focus/)).toBeInTheDocument();
		expect(screen.getByText("Syafiq")).toBeInTheDocument();
		expect(screen.getByText("Anas")).toBeInTheDocument();
	});

	it("collapses a team group on header click", async () => {
		render(<RosterGrid {...baseProps} />);
		await userEvent.click(screen.getByRole("button", { name: /^▼ Focus/ }));
		expect(screen.queryByText("Syafiq")).not.toBeInTheDocument();
	});

	it("invokes onCellOpen on plain click", async () => {
		const onCellOpen = vi.fn();
		render(<RosterGrid {...baseProps} onCellOpen={onCellOpen} />);
		const cells = screen
			.getAllByRole("button")
			.filter((b) => b.textContent === "X");
		await userEvent.click(cells[0]);
		expect(onCellOpen).toHaveBeenCalled();
		const arg = onCellOpen.mock.calls[0][0];
		expect(arg).toHaveProperty("employee_id");
		expect(arg).toHaveProperty("date");
	});

	it("invokes onRowOpen when employee name is clicked", async () => {
		const onRowOpen = vi.fn();
		render(<RosterGrid {...baseProps} onRowOpen={onRowOpen} />);
		await userEvent.click(screen.getByRole("button", { name: "Syafiq" }));
		expect(onRowOpen).toHaveBeenCalledWith("e1");
	});

	it("renders draft dot when pending edit exists for cell", () => {
		const pendingEdits = new Map<string, string | null>([
			["e1|2026-03-05", "s1"],
		]);
		render(<RosterGrid {...baseProps} pendingEdits={pendingEdits} />);
		expect(screen.getAllByTestId("draft-dot").length).toBeGreaterThanOrEqual(1);
	});

	it("shows weekday labels and a holiday badge + legend", () => {
		const withHoliday: CalendarPayload = {
			...payload,
			holidays: [{ date: "2026-03-04", name: "Test Holiday", type: "company" }],
		};
		render(<RosterGrid {...baseProps} payload={withHoliday} />);
		// weekday for 2026-03-02 (Mon) appears in a header cell
		expect(screen.getAllByText("Mon").length).toBeGreaterThan(0);
		// holiday column header carries the name as a tooltip (title)
		const holCell = screen.getByTitle("Test Holiday");
		expect(within(holCell).getByText("4")).toBeInTheDocument();
		// legend lists the holiday
		expect(screen.getByText(/Test Holiday/)).toBeInTheDocument();
	});

	it("shift-click extends selection and shows toolbar", async () => {
		render(<RosterGrid {...baseProps} />);
		const cells = screen
			.getAllByRole("button")
			.filter((b) => b.textContent === "X");
		const user = userEvent.setup();
		await user.keyboard("{Shift>}");
		await user.click(cells[0]);
		await user.click(cells[1]);
		await user.keyboard("{/Shift}");
		expect(screen.getByText(/Selected: 2/)).toBeInTheDocument();
	});
});
