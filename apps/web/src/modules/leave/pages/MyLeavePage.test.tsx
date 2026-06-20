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
		reason: "Doctor visit",
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
		taken: "2.0",
		pending: "0.0",
		carried_forward: "0.0",
		available: "14.0",
	},
];

const types = [{ id: "t1", code: "ANNUAL", name: "Annual", is_paid: true, is_statutory: false }];

const mocks = vi.hoisted(() => ({
	myBalances: vi.fn(),
	listMyRequests: vi.fn(),
	listTypes: vi.fn(),
	holidays: vi.fn(),
	cancel: vi.fn(),
}));

vi.mock("../api", () => ({
	leaveApi: {
		myBalances: mocks.myBalances,
		listMyRequests: mocks.listMyRequests,
		listTypes: mocks.listTypes,
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
	mocks.listTypes.mockResolvedValue(types);
	mocks.holidays.mockResolvedValue([]);
});

describe("MyLeavePage", () => {
	it("renders the balance hero, a balance tile and the Apply CTA", async () => {
		renderPage();
		await waitFor(() => expect(screen.getByText("14 days")).toBeInTheDocument());
		expect(screen.getAllByText(/available/i).length).toBeGreaterThan(0);
		expect(screen.getByRole("link", { name: /Apply for leave/i })).toHaveAttribute(
			"href",
			"/leave/apply",
		);
	});

	it("shows in-flight requests in the In progress section", async () => {
		renderPage();
		await waitFor(() => expect(screen.getByText("SICK leave")).toBeInTheDocument());
		// approved request is not in-flight → not in the default In progress view
		expect(screen.getByText(/In progress · 1/i)).toBeInTheDocument();
	});

	it("opens the request detail drawer with the reason when a card is clicked", async () => {
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByText("SICK leave"));
		await user.click(screen.getByText("SICK leave"));
		expect(await screen.findByRole("dialog")).toBeInTheDocument();
		expect(screen.getByText("Doctor visit")).toBeInTheDocument();
	});
});
