import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requests = [
	{
		id: "lr1",
		employee_id: "e1",
		leave_type: "ANNUAL",
		leave_type_code: "ANNUAL",
		start_date: "2026-05-10",
		end_date: "2026-05-13",
		total_days: "3.0",
		is_half_day: false,
		half_day_period: "",
		reason: "Family trip",
		status: "approved",
		current_level: 0,
		submitted_at: "2026-04-28T08:00:00Z",
		decided_at: "2026-04-28T10:00:00Z",
	},
	{
		id: "lr2",
		employee_id: "e1",
		leave_type: "SICK",
		leave_type_code: "SICK",
		start_date: "2026-05-14",
		end_date: "2026-05-14",
		total_days: "1.0",
		is_half_day: true,
		half_day_period: "pm",
		reason: "Doctor",
		status: "submitted",
		current_level: 1,
		submitted_at: "2026-04-28T09:00:00Z",
		decided_at: null,
	},
];

const balances = [
	{
		id: "b1",
		leave_type: "ANNUAL",
		leave_type_code: "ANNUAL",
		leave_type_name: "Annual",
		year: 2026,
		entitled: "16.0",
		accrued: "16.0",
		taken: "0.0",
		pending: "0.0",
		carried_forward: "0.0",
		available: "14.0",
	},
];

const mocks = vi.hoisted(() => ({
	myBalances: vi.fn(),
	listMyRequests: vi.fn(),
	holidays: vi.fn(),
	cancel: vi.fn(),
}));

vi.mock("../api", () => ({
	leaveApi: {
		myBalances: mocks.myBalances,
		listMyRequests: mocks.listMyRequests,
		holidays: mocks.holidays,
		cancel: mocks.cancel,
	},
}));

import MyLeavePage from "./MyLeavePage";

function renderPage() {
	return render(
		<MemoryRouter>
			<MyLeavePage />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	mocks.myBalances.mockResolvedValue(balances);
	mocks.listMyRequests.mockResolvedValue(requests);
	mocks.holidays.mockResolvedValue([]);
});

describe("MyLeavePage", () => {
	it("renders the hero and the three tabs", async () => {
		renderPage();
		await waitFor(() => expect(screen.getByText("Annual leave")).toBeInTheDocument());
		expect(screen.getByRole("tab", { name: "Calendar" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "History" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Balances" })).toBeInTheDocument();
	});

	it("shows requests with the Reason column in the History tab", async () => {
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByRole("tab", { name: "History" }));
		await user.click(screen.getByRole("tab", { name: "History" }));
		expect(await screen.findByText("Reason")).toBeInTheDocument();
		expect(screen.getByText("Family trip")).toBeInTheDocument();
		expect(screen.getByText(/½ PM/i)).toBeInTheDocument();
	});

	it("opens the detail panel when a history row is clicked", async () => {
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByRole("tab", { name: "History" }));
		await user.click(screen.getByRole("tab", { name: "History" }));
		await user.click(await screen.findByText("Family trip"));
		expect(await screen.findByRole("dialog")).toBeInTheDocument();
	});
});
