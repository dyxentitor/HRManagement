import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ balancesFor: vi.fn() }));
vi.mock("@/modules/leave/api", () => ({ leaveApi: api }));

import { LeaveBalanceCard } from "./LeaveBalanceCard";

const balance = {
	id: "b1",
	leave_type: "lt1",
	leave_type_code: "ANNUAL",
	leave_type_name: "Annual",
	year: 2026,
	entitled: "14.00",
	accrued: "14.00",
	taken: "3.00",
	pending: "1.00",
	carried_forward: "0.00",
	available: "10.00",
};

beforeEach(() => {
	api.balancesFor.mockReset();
});

describe("LeaveBalanceCard (read-only)", () => {
	it("renders the type and remaining, with no edit controls", async () => {
		api.balancesFor.mockResolvedValue([balance]);
		render(<LeaveBalanceCard employeeId="e1" />);
		await waitFor(() => expect(screen.getByText("Annual")).toBeInTheDocument());
		expect(screen.getByText("10")).toBeInTheDocument(); // remaining
		expect(screen.getByText("Leave & Holidays")).toBeInTheDocument();
		// pure view — no adjust / manage / edit buttons
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("renders nothing when the viewer isn't allowed (403)", async () => {
		api.balancesFor.mockRejectedValue(new Error("403"));
		const { container } = render(<LeaveBalanceCard employeeId="e1" />);
		await waitFor(() => expect(container).toBeEmptyDOMElement());
	});
});
