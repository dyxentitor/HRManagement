import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LeaveRequest } from "../api";
import { LeaveHistory } from "./LeaveHistory";

function req(over: Partial<LeaveRequest>): LeaveRequest {
	return {
		id: Math.random().toString(),
		employee_id: "e",
		leave_type: "a",
		leave_type_code: "ANNUAL",
		start_date: "2026-06-24",
		end_date: "2026-06-25",
		total_days: "2",
		is_half_day: false,
		half_day_period: "",
		reason: "Family trip",
		status: "approved",
		current_level: 1,
		submitted_at: null,
		decided_at: "2026-06-20T00:00:00Z",
		...over,
	} as LeaveRequest;
}

describe("LeaveHistory", () => {
	it("renders the Reason column and formatted dates", () => {
		render(<LeaveHistory requests={[req({})]} onSelect={vi.fn()} />);
		expect(screen.getByText("Reason")).toBeInTheDocument();
		expect(screen.getByText("Family trip")).toBeInTheDocument();
		expect(screen.getByText("24–25 Jun 2026")).toBeInTheDocument();
	});

	it("filters by status", async () => {
		render(
			<LeaveHistory
				requests={[
					req({ reason: "Approved one", status: "approved" }),
					req({ reason: "Pending one", status: "submitted" }),
				]}
				onSelect={vi.fn()}
			/>,
		);
		expect(screen.getByText("Pending one")).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Approved" }));
		expect(screen.queryByText("Pending one")).not.toBeInTheDocument();
		expect(screen.getByText("Approved one")).toBeInTheDocument();
	});
});
