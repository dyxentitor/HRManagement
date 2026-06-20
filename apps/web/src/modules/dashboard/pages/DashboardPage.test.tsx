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

vi.mock("../api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../api")>();
	return { ...actual, getDashboard: mocks.getDashboard };
});

import DashboardPage from "./DashboardPage";

function renderPage() {
	return render(
		<MemoryRouter>
			<DashboardPage />
		</MemoryRouter>,
	);
}

describe("DashboardPage (command center)", () => {
	it("renders hero, today's focus and smart insights for /admin", async () => {
		mocks.perms = new Set(["dashboard:read:admin", "payroll:run:create"]);
		mocks.getDashboard.mockResolvedValue({
			variant: "admin",
			cards: [
				{
					type: "hero_summary",
					title: "Today",
					data: {
						today: "2026-06-20",
						working_day: "Saturday",
						next_payroll_date: "2026-06-28",
						days_to_payroll: 3,
					},
				},
				{
					type: "pending_tasks",
					title: "Pending tasks",
					data: {
						tasks: [
							{
								key: "payroll_exceptions",
								label: "Payroll exceptions",
								count: 2,
								tone: "yellow",
								action_route: "/payroll/admin",
							},
						],
					},
				},
				{
					type: "smart_insights",
					title: "Smart insights",
					data: {
						payroll_days: 3,
						missing_docs: 5,
						contracts_expiring: 0,
						certs_expiring: 4,
						probation: 0,
						probation_ending: 0,
					},
				},
			],
		});
		renderPage();
		await waitFor(() => {
			expect(screen.getByText(/Ops/)).toBeInTheDocument();
		});
		expect(screen.getByText("Payroll exceptions")).toBeInTheDocument();
		expect(screen.getByText(/until payroll/)).toBeInTheDocument();
		expect(screen.getByText(/5 missing docs/)).toBeInTheDocument();
		expect(screen.getByText("Quick actions")).toBeInTheDocument();
	});

	it("picks the /team variant when team perm is present", async () => {
		mocks.perms = new Set(["dashboard:read:team", "dashboard:read:me"]);
		mocks.getDashboard.mockResolvedValue({
			variant: "team",
			cards: [
				{
					type: "hero_summary",
					title: "Today",
					data: {
						today: "2026-06-20",
						working_day: "Saturday",
						next_payroll_date: null,
						days_to_payroll: null,
					},
				},
			],
		});
		renderPage();
		await waitFor(() => {
			expect(screen.getByText(/Ops/)).toBeInTheDocument();
		});
		expect(mocks.getDashboard).toHaveBeenCalledWith("team");
	});

	it("renders an error state when the API fails", async () => {
		mocks.perms = new Set(["dashboard:read:me"]);
		mocks.getDashboard.mockRejectedValue(new Error("network down"));
		renderPage();
		await waitFor(() => {
			expect(screen.getByText(/network down/i)).toBeInTheDocument();
		});
	});
});
