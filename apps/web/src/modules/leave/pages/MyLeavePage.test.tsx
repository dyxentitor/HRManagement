import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

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
		is_half_day: false,
		half_day_period: "",
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
		year: 2026,
		entitled: "14.0",
		accrued: "14.0",
		taken: "0.0",
		pending: "0.0",
		carried_forward: "0.0",
		available: "14.0",
	},
];

const mocks = vi.hoisted(() => ({
	myBalances: vi.fn(),
	listMyRequests: vi.fn(),
	cancel: vi.fn(),
}));

vi.mock("../api", () => ({
	leaveApi: {
		myBalances: mocks.myBalances,
		listMyRequests: mocks.listMyRequests,
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

describe("MyLeavePage", () => {
	it("renders the 4 KPI tiles based on request statuses", async () => {
		mocks.myBalances.mockResolvedValue(balances);
		mocks.listMyRequests.mockResolvedValue(requests);
		renderPage();
		await waitFor(() => {
			expect(screen.getByText("Total leave")).toBeInTheDocument();
		});
		expect(screen.getByText("Approved")).toBeInTheDocument();
		expect(screen.getByText("Rejected")).toBeInTheDocument();
		expect(screen.getByText("Pending")).toBeInTheDocument();
	});

	it("renders the requests in a table", async () => {
		mocks.myBalances.mockResolvedValue([]);
		mocks.listMyRequests.mockResolvedValue(requests);
		renderPage();
		await waitFor(() => {
			expect(screen.getByText("ANNUAL")).toBeInTheDocument();
		});
		expect(screen.getByText("SICK")).toBeInTheDocument();
	});

	it("opens detail panel when a row is clicked", async () => {
		const user = userEvent.setup();
		mocks.myBalances.mockResolvedValue([]);
		mocks.listMyRequests.mockResolvedValue(requests);
		renderPage();
		await waitFor(() => screen.getByText("ANNUAL"));
		await user.click(screen.getByText("ANNUAL"));
		// detail panel renders title with the request id
		expect(await screen.findByRole("dialog")).toBeInTheDocument();
	});
});
