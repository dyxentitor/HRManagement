import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { LeaveBalance, LeaveType } from "../api";
import { LeaveTypeCards } from "./LeaveTypeCards";

const types = [
	{ id: "t1", code: "ANNUAL", name: "Annual", is_paid: true, is_statutory: false },
	{ id: "t2", code: "SICK", name: "Sick", is_paid: true, is_statutory: true },
] as LeaveType[];

const balances = [
	{
		id: "b1",
		leave_type: "ANNUAL",
		leave_type_code: "ANNUAL",
		leave_type_name: "Annual",
		year: 2026,
		entitled: "16.0",
		accrued: "16.0",
		taken: "2.0",
		pending: "0.0",
		carried_forward: "0.0",
		available: "14.0",
	},
] as LeaveBalance[];

describe("LeaveTypeCards", () => {
	it("renders a feature card per type linking to the prefilled apply form", () => {
		render(
			<MemoryRouter>
				<LeaveTypeCards types={types} balances={balances} />
			</MemoryRouter>,
		);
		expect(screen.getByRole("link", { name: /Annual/ })).toHaveAttribute(
			"href",
			"/leave/apply?type=t1",
		);
		expect(screen.getByRole("link", { name: /Sick/ })).toHaveAttribute(
			"href",
			"/leave/apply?type=t2",
		);
		// shows the balance hint for a type that has one
		expect(screen.getByText(/14 of 16 left/i)).toBeInTheDocument();
	});
});
