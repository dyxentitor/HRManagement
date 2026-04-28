import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const inbox = [
	{
		kind: "leave",
		id: "lr1",
		employee_code: "PVT-OPS-001",
		summary: "Annual leave 14 May (1d)",
		submitted_at: "2026-04-28T07:00:00Z",
		deep_link: "/leave/lr1",
	},
	{
		kind: "claim",
		id: "cl1",
		employee_code: "PVT-OPS-001",
		summary: "Reimbursement RM 350",
		submitted_at: "2026-04-27T10:00:00Z",
		deep_link: "/claims/cl1",
	},
] as const;

const mocks = vi.hoisted(() => ({
	getInbox: vi.fn(),
	approveItem: vi.fn(),
	rejectItem: vi.fn(),
}));

vi.mock("../api", () => ({
	getInbox: mocks.getInbox,
	approveItem: mocks.approveItem,
	rejectItem: mocks.rejectItem,
}));

import UnifiedInboxPage from "./UnifiedInboxPage";

function renderPage() {
	return render(
		<MemoryRouter>
			<UnifiedInboxPage />
		</MemoryRouter>,
	);
}

describe("UnifiedInboxPage", () => {
	it("shows All / Leave / Claims / KPI filter pills with counts", async () => {
		mocks.getInbox.mockResolvedValue(inbox);
		renderPage();
		await waitFor(() =>
			expect(screen.getAllByText(/PVT-OPS-001/).length).toBeGreaterThan(0),
		);
		expect(
			screen.getByRole("button", { name: /All · 2/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Leave · 1/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Claims · 1/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /KPI · 0/i }),
		).toBeInTheDocument();
	});

	it("filters when a kind pill is clicked", async () => {
		const user = userEvent.setup();
		mocks.getInbox.mockResolvedValue(inbox);
		renderPage();
		await waitFor(() =>
			expect(screen.getByText(/Annual leave/)).toBeInTheDocument(),
		);
		await user.click(screen.getByRole("button", { name: /Leave · 1/i }));
		expect(screen.getByText(/Annual leave/)).toBeInTheDocument();
		expect(screen.queryByText(/Reimbursement/)).not.toBeInTheDocument();
	});

	it("opens DetailPanel on row click", async () => {
		const user = userEvent.setup();
		mocks.getInbox.mockResolvedValue(inbox);
		renderPage();
		await waitFor(() => screen.getByText(/Annual leave/));
		await user.click(screen.getByText(/Annual leave/));
		expect(await screen.findByRole("dialog")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /approve/i }),
		).toBeInTheDocument();
	});

	it("shows empty state when filter has no matches", async () => {
		const user = userEvent.setup();
		mocks.getInbox.mockResolvedValue(inbox);
		renderPage();
		await waitFor(() => screen.getByRole("button", { name: /All · 2/i }));
		await user.click(screen.getByRole("button", { name: /KPI · 0/i }));
		expect(screen.getByText(/All caught up/i)).toBeInTheDocument();
	});
});
