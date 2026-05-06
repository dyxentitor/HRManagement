import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CalendarAssignment, CalendarEmployee } from "../api";

import { CoverUpPicker } from "./CoverUpPicker";

const employees: CalendarEmployee[] = [
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
	{
		id: "e3",
		full_name: "Faizal",
		employee_code: "EMP003",
		status: "active",
		department_name: "L2",
		role_title: "Engineer",
		team_id: "t2",
	},
	{
		id: "e4",
		full_name: "Inactive Joe",
		employee_code: "EMP004",
		status: "terminated",
		department_name: "L1",
		role_title: "Lead",
		team_id: "t1",
	},
];

const baseAssignment: CalendarAssignment = {
	id: "a1",
	employee_id: "e1",
	work_date: "2026-06-03",
	shift_id: "s1",
	shift_code: "M",
	covering_for_id: null,
	covering_for_name: null,
	is_published: true,
	notes: "",
};

describe("CoverUpPicker", () => {
	it("excludes the row's own employee from the teammate list", () => {
		render(
			<CoverUpPicker
				assignment={baseAssignment}
				teammates={employees}
				onSave={vi.fn()}
				onClear={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const select = screen.getByLabelText(/covering for/i);
		expect(select).not.toHaveTextContent("Syafiq");
		expect(select).toHaveTextContent("Anas");
	});

	it("filters out non-active employees", () => {
		render(
			<CoverUpPicker
				assignment={baseAssignment}
				teammates={employees}
				onSave={vi.fn()}
				onClear={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const select = screen.getByLabelText(/covering for/i);
		expect(select).not.toHaveTextContent("Inactive Joe");
	});

	it("pre-fills the existing covering teammate when assignment.covering_for_id is set", () => {
		render(
			<CoverUpPicker
				assignment={{
					...baseAssignment,
					covering_for_id: "e2",
					covering_for_name: "Anas",
				}}
				teammates={employees}
				onSave={vi.fn()}
				onClear={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const select = screen.getByLabelText(/covering for/i) as HTMLSelectElement;
		expect(select.value).toBe("e2");
	});

	it("calls onSave with the chosen teammate id when Save is clicked", async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(
			<CoverUpPicker
				assignment={baseAssignment}
				teammates={employees}
				onSave={onSave}
				onClear={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const user = userEvent.setup();
		await user.selectOptions(screen.getByLabelText(/covering for/i), "e2");
		await user.click(screen.getByRole("button", { name: /save/i }));
		expect(onSave).toHaveBeenCalledWith("e2");
	});

	it("calls onClear when Clear is clicked (only visible if cover-up exists)", async () => {
		const onClear = vi.fn().mockResolvedValue(undefined);
		render(
			<CoverUpPicker
				assignment={{
					...baseAssignment,
					covering_for_id: "e2",
					covering_for_name: "Anas",
				}}
				teammates={employees}
				onSave={vi.fn()}
				onClear={onClear}
				onCancel={vi.fn()}
			/>,
		);
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: /clear/i }));
		expect(onClear).toHaveBeenCalled();
	});
});
