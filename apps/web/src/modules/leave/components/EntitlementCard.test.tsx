import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { LeaveBalance } from "../api";
import { EntitlementCard } from "./EntitlementCard";

const baseBalance: LeaveBalance = {
	id: "1",
	leave_type: "annual-id",
	leave_type_code: "ANNUAL",
	leave_type_name: "Annual Leave",
	year: 2026,
	entitled: "16",
	accrued: "16",
	taken: "4",
	pending: "1.5",
	carried_forward: "0",
	carried_forward_expires_at: null,
	available: "10.5",
	ledger_recent: [
		{
			ts: "2026-01-01T00:00:00Z",
			delta: "16",
			reason: "accrual",
			reference_type: "accrual_year_start",
		},
	],
};

describe("EntitlementCard", () => {
	it("renders the 5-column stat row", () => {
		render(<EntitlementCard balance={baseBalance} />);
		expect(screen.getByText("Granted")).toBeInTheDocument();
		expect(screen.getByText("16")).toBeInTheDocument();
		expect(screen.getByText("4")).toBeInTheDocument();
		expect(screen.getByText("10.5")).toBeInTheDocument();
	});

	it("hides expiry pill when carried_forward is 0", () => {
		render(<EntitlementCard balance={baseBalance} />);
		expect(screen.queryByText(/Expires/)).toBeNull();
	});

	it("shows expiry pill in orange/peach when within 30 days", () => {
		const today = new Date();
		const soon = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
		const soonIso = soon.toISOString().slice(0, 10);
		render(
			<EntitlementCard
				balance={{
					...baseBalance,
					carried_forward: "2",
					carried_forward_expires_at: soonIso,
				}}
			/>,
		);
		const pill = screen.getByText(/Expires/);
		expect(pill).toBeInTheDocument();
		expect(pill.className).toMatch(/orange/);
	});

	it("expands ledger panel on click", async () => {
		render(<EntitlementCard balance={baseBalance} />);
		await userEvent.click(
			screen.getByRole("button", { name: /Show recent activity/i }),
		);
		expect(screen.getByText(/accrual_year_start/)).toBeInTheDocument();
	});
});
