import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LeaveBalance } from "../api";
import { LeaveBalanceTiles } from "./LeaveBalanceTiles";

function bal(over: Partial<LeaveBalance>): LeaveBalance {
	return {
		id: "b1",
		leave_type: "ANNUAL",
		leave_type_code: "ANNUAL",
		leave_type_name: "Annual",
		year: 2026,
		entitled: "16",
		accrued: "16",
		taken: "0",
		pending: "0",
		carried_forward: "0",
		available: "12",
		...over,
	} as LeaveBalance;
}

describe("LeaveBalanceTiles", () => {
	it("renders the available days for a normal balance", () => {
		render(<LeaveBalanceTiles balances={[bal({ available: "12" })]} onSelect={() => {}} />);
		expect(screen.getByText("12")).toBeInTheDocument();
		expect(screen.getByText(/of 16 days/i)).toBeInTheDocument();
	});

	it("never shows a negative number for an over-allocated balance", () => {
		render(
			<LeaveBalanceTiles
				balances={[bal({ id: "b2", available: "-4", taken: "20" })]}
				onSelect={() => {}}
			/>,
		);
		// floored at 0 — no alarming "-4"
		expect(screen.getByText("0")).toBeInTheDocument();
		expect(screen.queryByText("-4")).not.toBeInTheDocument();
		// over-allocation surfaced explicitly instead
		expect(screen.getByText(/over by 4 days/i)).toBeInTheDocument();
	});
});
