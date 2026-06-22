import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	listTypes: vi.fn(),
	overridesFor: vi.fn(),
	createOverride: vi.fn(),
	deleteOverride: vi.fn(),
}));
vi.mock("@/modules/leave/api", () => ({ leaveApi: api }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { LeaveOverrideCard } from "./LeaveOverrideCard";

const TYPES = [
	{ id: "lt1", code: "ANNUAL", name: "Annual", is_paid: true, is_statutory: true },
	{ id: "lt2", code: "SICK", name: "Sick", is_paid: true, is_statutory: true },
];

beforeEach(() => {
	for (const m of Object.values(api)) m.mockReset();
	api.listTypes.mockResolvedValue(TYPES);
	api.overridesFor.mockResolvedValue([
		{ id: "o1", leave_type: "lt1", days_override: "18", effective_from: "2026-01-01" },
	]);
	api.createOverride.mockResolvedValue({ id: "o2" });
	api.deleteOverride.mockResolvedValue(undefined);
});

describe("LeaveOverrideCard", () => {
	it("lists existing overrides with the type name and days", async () => {
		render(<LeaveOverrideCard employeeId="e1" />);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /edit annual/i })).toBeInTheDocument(),
		);
		expect(screen.getByText("18")).toBeInTheDocument();
		expect(screen.getByText(/HR only/i)).toBeInTheDocument();
	});

	it("adds a new override", async () => {
		const user = userEvent.setup();
		render(<LeaveOverrideCard employeeId="e1" />);
		await waitFor(() => screen.getByRole("button", { name: /delete annual/i }));

		await user.type(screen.getByLabelText(/new override days/i), "12");
		await user.type(screen.getByLabelText(/new override effective from/i), "2026-06-01");
		await user.click(screen.getByRole("button", { name: /add override/i }));

		await waitFor(() => expect(api.createOverride).toHaveBeenCalled());
		expect(api.createOverride).toHaveBeenCalledWith("e1", {
			leave_type: "lt1",
			days_override: "12",
			effective_from: "2026-06-01",
		});
	});

	it("edits an override inline (delete + recreate)", async () => {
		const user = userEvent.setup();
		render(<LeaveOverrideCard employeeId="e1" />);
		await waitFor(() => screen.getByRole("button", { name: /delete annual/i }));

		await user.click(screen.getByRole("button", { name: /edit annual/i }));
		const daysInput = screen.getByLabelText(/^override days/i);
		await user.clear(daysInput);
		await user.type(daysInput, "20");
		await user.click(screen.getByRole("button", { name: /^save/i }));

		await waitFor(() => expect(api.deleteOverride).toHaveBeenCalledWith("o1"));
		expect(api.createOverride).toHaveBeenCalledWith("e1", {
			leave_type: "lt1",
			days_override: "20",
			effective_from: "2026-01-01",
		});
	});

	it("deletes an override", async () => {
		const user = userEvent.setup();
		render(<LeaveOverrideCard employeeId="e1" />);
		await waitFor(() => screen.getByRole("button", { name: /delete annual/i }));
		await user.click(screen.getByRole("button", { name: /delete annual/i }));
		await waitFor(() => expect(api.deleteOverride).toHaveBeenCalledWith("o1"));
	});

	it("shows an empty state when there are no overrides", async () => {
		api.overridesFor.mockResolvedValue([]);
		render(<LeaveOverrideCard employeeId="e1" />);
		await waitFor(() => expect(screen.getByText(/defaults apply/i)).toBeInTheDocument());
	});
});
