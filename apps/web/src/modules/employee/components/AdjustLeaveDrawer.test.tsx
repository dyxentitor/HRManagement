import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	listTypes: vi.fn(),
	overridesFor: vi.fn(),
	adjustBalance: vi.fn(),
	createOverride: vi.fn(),
	deleteOverride: vi.fn(),
}));
vi.mock("@/modules/leave/api", () => ({ leaveApi: api }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AdjustLeaveDrawer } from "./AdjustLeaveDrawer";

beforeEach(() => {
	for (const m of Object.values(api)) m.mockReset();
	api.listTypes.mockResolvedValue([
		{ id: "lt1", code: "ANNUAL", name: "Annual", is_paid: true, is_statutory: true },
	]);
	api.overridesFor.mockResolvedValue([]);
	api.adjustBalance.mockResolvedValue({});
});

describe("AdjustLeaveDrawer", () => {
	it("submits a one-off adjustment with delta + note", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		render(<AdjustLeaveDrawer employeeId="e1" open onClose={() => {}} onChanged={onChanged} />);
		await waitFor(() => expect(api.listTypes).toHaveBeenCalled());

		await user.type(screen.getByLabelText(/days \(\+\/-\)/i), "2");
		await user.type(screen.getByLabelText(/^reason/i), "goodwill day");
		await user.click(screen.getByRole("button", { name: /apply adjustment/i }));

		await waitFor(() => expect(api.adjustBalance).toHaveBeenCalled());
		expect(api.adjustBalance).toHaveBeenCalledWith({
			employee_id: "e1",
			leave_type_id: "lt1",
			delta: "2",
			note: "goodwill day",
		});
		expect(onChanged).toHaveBeenCalled();
	});

	it("adds an entitlement override", async () => {
		const user = userEvent.setup();
		api.createOverride.mockResolvedValue({ id: "o1" });
		render(<AdjustLeaveDrawer employeeId="e1" open onClose={() => {}} />);
		await waitFor(() => expect(api.listTypes).toHaveBeenCalled());

		await user.type(screen.getByLabelText(/override days/i), "18");
		await user.type(screen.getByLabelText(/effective from/i), "2026-01-01");
		await user.click(screen.getByRole("button", { name: /add override/i }));

		await waitFor(() => expect(api.createOverride).toHaveBeenCalled());
		expect(api.createOverride).toHaveBeenCalledWith("e1", {
			leave_type: "lt1",
			days_override: "18",
			effective_from: "2026-01-01",
		});
	});
});
