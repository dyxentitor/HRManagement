import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getMe: vi.fn(),
	listTypes: vi.fn(),
	apply: vi.fn(),
	submit: vi.fn(),
}));
vi.mock("@/modules/employee/api", () => ({
	employeeApi: { getMe: mocks.getMe },
}));
vi.mock("../api", () => ({
	leaveApi: {
		listTypes: mocks.listTypes,
		apply: mocks.apply,
		submit: mocks.submit,
	},
}));

import LeaveApplyPage from "./LeaveApplyPage";

beforeEach(() => {
	mocks.getMe.mockReset();
	mocks.listTypes.mockReset();
	mocks.apply.mockReset();
	mocks.submit.mockReset();
	mocks.getMe.mockResolvedValue({ id: "e1" });
	mocks.listTypes.mockResolvedValue([
		{ id: "lt1", code: "ANNUAL", name: "Annual" },
	]);
	mocks.apply.mockResolvedValue({ id: "r1" });
	mocks.submit.mockResolvedValue({ id: "r1" });
});

function renderPage() {
	return render(
		<MemoryRouter>
			<LeaveApplyPage />
		</MemoryRouter>,
	);
}

describe("LeaveApplyPage half-day", () => {
	it("collapses to a single date + AM/PM when Half day is chosen", async () => {
		const user = userEvent.setup();
		renderPage();
		await screen.findByRole("option", { name: /annual/i });
		await user.click(screen.getByRole("radio", { name: /half day/i }));
		expect(screen.getByLabelText(/^date/i)).toBeInTheDocument();
		expect(screen.queryByLabelText(/end date/i)).not.toBeInTheDocument();
		expect(screen.getByRole("radio", { name: /morning/i })).toBeInTheDocument();
		expect(
			screen.getByRole("radio", { name: /afternoon/i }),
		).toBeInTheDocument();
	});

	it("submits a half-day payload with equal start/end and 0.5 days", async () => {
		const user = userEvent.setup();
		renderPage();
		await screen.findByRole("option", { name: /annual/i });
		await user.selectOptions(
			screen.getByRole("combobox", { name: /leave type/i }),
			"lt1",
		);
		await user.click(screen.getByRole("radio", { name: /half day/i }));
		await user.type(screen.getByLabelText(/^date/i), "2026-06-03");
		await user.click(screen.getByRole("radio", { name: /afternoon/i }));
		await user.click(screen.getByRole("button", { name: /^apply$/i }));
		await waitFor(() => expect(mocks.apply).toHaveBeenCalled());
		expect(mocks.apply.mock.calls[0][0]).toMatchObject({
			start_date: "2026-06-03",
			end_date: "2026-06-03",
			is_half_day: true,
			half_day_period: "pm",
			total_days: "0.5",
		});
	});

	it("keeps a Start/End range in full-day mode", async () => {
		const user = userEvent.setup();
		renderPage();
		await screen.findByRole("option", { name: /annual/i });
		expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
		await user.click(screen.getByRole("radio", { name: /full day/i }));
		expect(screen.queryByRole("radio", { name: /morning/i })).toBeNull();
	});
});
