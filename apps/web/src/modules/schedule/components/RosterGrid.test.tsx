import { render, screen } from "@testing-library/react";
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

describe("RosterGrid", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("renders teams as collapsible groups", () => {
		render(
			<RosterGrid
				viewMode="week"
				payload={payload}
				onCellClick={vi.fn()}
				onSelectionApply={vi.fn()}
			/>,
		);
		expect(screen.getByText(/Focus/)).toBeInTheDocument();
		expect(screen.getByText("Syafiq")).toBeInTheDocument();
		expect(screen.getByText("Anas")).toBeInTheDocument();
	});

	it("collapses a team group on header click", async () => {
		render(
			<RosterGrid
				viewMode="week"
				payload={payload}
				onCellClick={vi.fn()}
				onSelectionApply={vi.fn()}
			/>,
		);
		await userEvent.click(screen.getByRole("button", { name: /Focus/ }));
		expect(screen.queryByText("Syafiq")).not.toBeInTheDocument();
	});

	it("invokes onCellClick on plain click", async () => {
		const onCellClick = vi.fn();
		render(
			<RosterGrid
				viewMode="week"
				payload={payload}
				onCellClick={onCellClick}
				onSelectionApply={vi.fn()}
			/>,
		);
		const cells = screen
			.getAllByRole("button")
			.filter((b) => b.textContent === "X");
		await userEvent.click(cells[0]);
		expect(onCellClick).toHaveBeenCalled();
	});

	it("shift-click extends selection and shows toolbar", async () => {
		render(
			<RosterGrid
				viewMode="week"
				payload={payload}
				onCellClick={vi.fn()}
				onSelectionApply={vi.fn()}
			/>,
		);
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
