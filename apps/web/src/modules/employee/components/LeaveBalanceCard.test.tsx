import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const perm = vi.hoisted(() => ({ can: vi.fn() }));
const api = vi.hoisted(() => ({ balancesFor: vi.fn() }));
vi.mock("@/lib/perm", () => ({ useCan: (p: string) => perm.can(p) }));
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
	perm.can.mockReturnValue(false);
	api.balancesFor.mockReset();
});

describe("LeaveBalanceCard", () => {
	it("renders the balance row with the remaining amount", async () => {
		api.balancesFor.mockResolvedValue([balance]);
		render(<LeaveBalanceCard employeeId="e1" />);
		await waitFor(() => expect(screen.getByText("Annual")).toBeInTheDocument());
		expect(screen.getByText("10.00")).toBeInTheDocument(); // available / remaining
		expect(screen.getByText("Leave & Holidays")).toBeInTheDocument();
	});

	it("hides the Adjust button without the adjust permission", async () => {
		api.balancesFor.mockResolvedValue([balance]);
		render(<LeaveBalanceCard employeeId="e1" />);
		await waitFor(() => screen.getByText("Annual"));
		expect(screen.queryByRole("button", { name: /adjust leave/i })).not.toBeInTheDocument();
	});

	it("shows the Adjust button for HR/Admin", async () => {
		perm.can.mockReturnValue(true);
		api.balancesFor.mockResolvedValue([balance]);
		render(<LeaveBalanceCard employeeId="e1" />);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /adjust leave/i })).toBeInTheDocument(),
		);
	});

	it("renders nothing when the viewer isn't allowed (403)", async () => {
		api.balancesFor.mockRejectedValue(new Error("403"));
		const { container } = render(<LeaveBalanceCard employeeId="e1" />);
		await waitFor(() => expect(container).toBeEmptyDOMElement());
	});
});
