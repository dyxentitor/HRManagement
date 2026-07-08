import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inbox = [
	{
		kind: "leave",
		id: "lr1",
		employee_code: "PVT-OPS-001",
		summary: "Annual leave",
		submitted_at: "2026-04-28T07:00:00Z",
		deep_link: "/approvals?focus=lr1",
		employee_id: "e1",
		name: "John Tan",
		department: "Engineering",
		type_code: "ANNUAL",
		detail: { start_date: "2026-05-14", end_date: "2026-05-14", total_days: "1", reason: "Trip" },
	},
	{
		kind: "claim",
		id: "cl1",
		employee_code: "PVT-OPS-002",
		summary: "Reimbursement",
		submitted_at: "2026-04-27T10:00:00Z",
		deep_link: "/approvals?focus=cl1",
		employee_id: "e2",
		name: "Siti Yusof",
		department: "Design",
		type_code: "TRAVEL",
		detail: { amount: "350", currency_code: "MYR", expense_date: "2026-04-27" },
	},
];

const mocks = vi.hoisted(() => ({
	getInbox: vi.fn(),
	approveItem: vi.fn(),
	rejectItem: vi.fn(),
	coverage: vi.fn(),
}));

vi.mock("../api", () => ({
	getInbox: mocks.getInbox,
	approveItem: mocks.approveItem,
	rejectItem: mocks.rejectItem,
}));
vi.mock("@/modules/leave/api", () => ({ leaveApi: { coverage: mocks.coverage } }));
vi.mock("@/lib/perm", () => ({ useCan: () => false }));

import UnifiedInboxPage from "./UnifiedInboxPage";

function renderPage() {
	return render(
		<MemoryRouter>
			<UnifiedInboxPage />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	for (const f of Object.values(mocks)) f.mockReset();
	mocks.coverage.mockResolvedValue({ team_size: 0, per_day: {}, people: [] });
});

describe("UnifiedInboxPage", () => {
	it("shows filter pills with counts and a rich card per item", async () => {
		mocks.getInbox.mockResolvedValue(inbox);
		renderPage();
		await waitFor(() => expect(screen.getByText("John Tan")).toBeInTheDocument());
		expect(screen.getByText("Siti Yusof")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /All · 2/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Leave · 1/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Claims · 1/i })).toBeInTheDocument();
		// who: department surfaced; what: the claim amount + leave days
		expect(screen.getByText(/Engineering/)).toBeInTheDocument();
		expect(screen.getByText(/MYR 350/)).toBeInTheDocument();
		expect(screen.getByText(/1 days/)).toBeInTheDocument();
		// leave card shows a coverage badge
		expect(screen.getByText(/No coverage clash/)).toBeInTheDocument();
	});

	it("filters when a kind pill is clicked", async () => {
		const user = userEvent.setup();
		mocks.getInbox.mockResolvedValue(inbox);
		renderPage();
		await waitFor(() => screen.getByText("John Tan"));
		await user.click(screen.getByRole("button", { name: /Leave · 1/i }));
		expect(screen.getByText("John Tan")).toBeInTheDocument();
		expect(screen.queryByText("Siti Yusof")).not.toBeInTheDocument();
	});

	it("approves inline", async () => {
		const user = userEvent.setup();
		mocks.getInbox.mockResolvedValue(inbox);
		mocks.approveItem.mockResolvedValue(undefined);
		renderPage();
		await waitFor(() => screen.getByText("John Tan"));
		await user.click(screen.getAllByRole("button", { name: "Approve" })[0]);
		await waitFor(() => expect(mocks.approveItem).toHaveBeenCalled());
	});

	it("shows empty state when a filter has no matches", async () => {
		const user = userEvent.setup();
		mocks.getInbox.mockResolvedValue(inbox);
		renderPage();
		await waitFor(() => screen.getByRole("button", { name: /All · 2/i }));
		await user.click(screen.getByRole("button", { name: /KPI · 0/i }));
		expect(screen.getByText(/All caught up/i)).toBeInTheDocument();
	});
});
