import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	listTypes: vi.fn(),
	balancesFor: vi.fn(),
	adjustBalance: vi.fn(),
}));
vi.mock("@/modules/leave/api", () => ({ leaveApi: api }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AdjustLeaveCard } from "./AdjustLeaveCard";

beforeEach(() => {
	for (const m of Object.values(api)) m.mockReset();
	api.listTypes.mockResolvedValue([
		{ id: "lt1", code: "ANNUAL", name: "Annual", is_paid: true, is_statutory: true },
	]);
	api.balancesFor.mockResolvedValue([
		{ id: "b1", leave_type: "lt1", leave_type_code: "ANNUAL", year: 2026, available: "10" },
	]);
	api.adjustBalance.mockResolvedValue({});
});

describe("AdjustLeaveCard", () => {
	it("shows a live before→after preview and submits the adjustment", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		render(<AdjustLeaveCard employeeId="e1" onChanged={onChanged} />);
		await waitFor(() => expect(api.balancesFor).toHaveBeenCalled());
		await waitFor(() => expect(screen.getByText("10")).toBeInTheDocument());

		await user.type(screen.getByLabelText(/days \(\+\/-\)/i), "2");
		await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument()); // preview

		await user.type(screen.getByLabelText(/^reason/i), "goodwill day");
		await user.click(screen.getByRole("button", { name: /^apply/i }));

		await waitFor(() => expect(api.adjustBalance).toHaveBeenCalled());
		expect(api.adjustBalance).toHaveBeenCalledWith({
			employee_id: "e1",
			leave_type_id: "lt1",
			delta: "2",
			note: "goodwill day",
		});
		expect(onChanged).toHaveBeenCalled();
	});
});
