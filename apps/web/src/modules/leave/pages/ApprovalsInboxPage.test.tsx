import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listTeamRequests: vi.fn(),
	coverage: vi.fn(),
	approve: vi.fn(),
	reject: vi.fn(),
	empList: vi.fn(),
}));

vi.mock("../api", async (orig) => {
	const actual = await orig<typeof import("../api")>();
	return {
		...actual,
		leaveApi: {
			...actual.leaveApi,
			listTeamRequests: mocks.listTeamRequests,
			coverage: mocks.coverage,
			approve: mocks.approve,
			reject: mocks.reject,
		},
	};
});
vi.mock("@/modules/employee/api", () => ({ employeeApi: { list: mocks.empList } }));

import ApprovalsInboxPage from "./ApprovalsInboxPage";

const req = {
	id: "lr1",
	employee_id: "e1",
	leave_type: "a",
	leave_type_code: "ANNUAL",
	start_date: "2026-06-24",
	end_date: "2026-06-25",
	total_days: "2",
	is_half_day: false,
	half_day_period: "",
	reason: "Family trip",
	status: "submitted",
	current_level: 1,
	submitted_at: "2026-06-20T00:00:00Z",
	decided_at: null,
};

beforeEach(() => {
	for (const f of Object.values(mocks)) f.mockReset();
	mocks.empList.mockResolvedValue([{ id: "e1", first_name: "John", last_name: "Tan" }]);
	mocks.coverage.mockResolvedValue({
		team_size: 5,
		per_day: { "2026-06-24": 2 },
		people: [{ employee_id: "e2", name: "Ahmad R.", leave_type_code: "ANNUAL", start: "2026-06-24", end: "2026-06-24", status: "approved" }],
	});
});

function renderPage() {
	render(
		<MemoryRouter>
			<ApprovalsInboxPage />
		</MemoryRouter>,
	);
}

describe("ApprovalsInboxPage", () => {
	it("shows pending requests with the requester name and a coverage clash badge", async () => {
		mocks.listTeamRequests.mockResolvedValue([req]);
		renderPage();
		await waitFor(() => expect(screen.getByText("John Tan")).toBeInTheDocument());
		expect(screen.getByText(/1 pending/)).toBeInTheDocument();
		expect(screen.getByText(/Coverage: 2 teammate/)).toBeInTheDocument();
		expect(screen.getByText("Family trip", { exact: false })).toBeInTheDocument();
	});

	it("approves a request", async () => {
		mocks.listTeamRequests.mockResolvedValue([req]);
		mocks.approve.mockResolvedValue({});
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByText("John Tan"));
		await user.click(screen.getByRole("button", { name: "Approve" }));
		await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith("lr1", ""));
	});

	it("shows an empty state when nothing is pending", async () => {
		mocks.listTeamRequests.mockResolvedValue([]);
		renderPage();
		expect(await screen.findByText(/all caught up/i)).toBeInTheDocument();
	});
});
