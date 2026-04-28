import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	perms: new Set<string>(),
	user: { email: "ops.lead@provintell.demo" },
	getDashboard: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
	useAuth: () => ({
		user: mocks.user,
		perms: mocks.perms,
		roles: [],
		logout: vi.fn(),
	}),
}));

vi.mock("../api", () => ({
	getDashboard: mocks.getDashboard,
}));

import DashboardPage from "./DashboardPage";

function renderPage() {
	return render(
		<MemoryRouter>
			<DashboardPage />
		</MemoryRouter>,
	);
}

describe("DashboardPage", () => {
	it("renders /me KPI tiles when only me perm is granted", async () => {
		mocks.perms = new Set(["dashboard:read:me"]);
		mocks.getDashboard.mockResolvedValue({
			variant: "me",
			cards: [
				{
					type: "my_leave_balance",
					title: "My leave",
					data: { annual_days: 14, carried: 2 },
				},
			],
		});
		renderPage();
		await waitFor(() => {
			expect(screen.getByText(/Annual leave/i)).toBeInTheDocument();
		});
		expect(screen.getByText(/14 d/)).toBeInTheDocument();
	});

	it("picks /team variant when team perm is present", async () => {
		mocks.perms = new Set(["dashboard:read:team", "dashboard:read:me"]);
		mocks.getDashboard.mockResolvedValue({
			variant: "team",
			cards: [
				{ type: "pending_approvals", title: "Pending", data: { count: 5 } },
			],
		});
		renderPage();
		await waitFor(() => {
			expect(screen.getByText(/Pending approvals/i)).toBeInTheDocument();
		});
		expect(mocks.getDashboard).toHaveBeenCalledWith("team");
	});

	it("renders an error state when the API fails", async () => {
		mocks.perms = new Set(["dashboard:read:me"]);
		mocks.getDashboard.mockRejectedValue(new Error("network down"));
		renderPage();
		await waitFor(() => {
			expect(
				screen.getByText(/network down|unable to load|error/i),
			).toBeInTheDocument();
		});
	});
});
