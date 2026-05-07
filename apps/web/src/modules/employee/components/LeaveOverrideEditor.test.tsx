import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LeaveOverrideEditor } from "./LeaveOverrideEditor";

vi.mock("@/lib/perm", () => ({ useCan: () => true }));
vi.mock("@/modules/admin/leave-overrides-api", () => ({
	leaveOverrideApi: {
		list: vi.fn().mockResolvedValue([
			{
				id: "1",
				employee_id: "e",
				leave_type: "lt-annual",
				days_override: "21",
				effective_from: "2026-01-01",
				effective_to: null,
				note: "Senior offer letter",
				created_by: null,
				created_at: "2026-05-07T10:00:00Z",
			},
		]),
		create: vi.fn(),
		remove: vi.fn(),
	},
}));
vi.mock("@/modules/admin/leave-types-api", () => ({
	leaveTypeApi: {
		list: vi
			.fn()
			.mockResolvedValue([{ id: "lt-annual", code: "ANNUAL", name: "Annual" }]),
	},
}));

describe("LeaveOverrideEditor", () => {
	it("renders existing overrides with note + days", async () => {
		render(<LeaveOverrideEditor employeeId="e" />);
		expect(await screen.findByText(/Senior offer letter/)).toBeInTheDocument();
		expect(await screen.findByText(/21 days/)).toBeInTheDocument();
	});

	it("opens add modal on '+ Add override' click", async () => {
		render(<LeaveOverrideEditor employeeId="e" />);
		await userEvent.click(
			await screen.findByRole("button", { name: /Add override/i }),
		);
		expect(await screen.findByLabelText(/Effective from/i)).toBeInTheDocument();
	});
});
