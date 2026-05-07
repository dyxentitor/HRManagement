import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AdminLeaveTypesPage from "./AdminLeaveTypesPage";

vi.mock("@/lib/perm", () => ({ useCan: () => true }));
vi.mock("../leave-types-api", () => ({
	leaveTypeApi: {
		list: vi.fn().mockResolvedValue([
			{
				id: "1",
				code: "ANNUAL",
				name: "Annual",
				accrual_type: "annual",
				default_days: "8",
				is_paid: true,
				requires_attachment: false,
				max_consecutive_days: null,
				min_advance_notice_days: 0,
				carry_forward_max: "5",
				is_statutory: true,
				gender_restriction: "any",
				carry_forward_expiry_months: 12,
				requires_service_months: 0,
				notice_days_required: 0,
				max_per_lifetime_events: null,
			},
		]),
		update: vi.fn(),
	},
	leavePolicyApi: { list: vi.fn().mockResolvedValue([]) },
}));

describe("AdminLeaveTypesPage", () => {
	it("renders leave types in the master pane", async () => {
		render(<AdminLeaveTypesPage />);
		expect(await screen.findByText("ANNUAL")).toBeInTheDocument();
	});

	it("renders all three tabs in the detail pane", async () => {
		render(<AdminLeaveTypesPage />);
		await screen.findByText("ANNUAL");
		expect(screen.getByRole("tab", { name: /General/i })).toBeInTheDocument();
		expect(
			screen.getByRole("tab", { name: /Tenure tiers/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("tab", { name: /Carry-forward/i }),
		).toBeInTheDocument();
	});
});
