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

describe("DashboardPage", () => {
	it("renders the hero, pending tasks and quick actions for /me", async () => {
		mocks.perms = new Set(["dashboard:read:me", "leave:request:create:self"]);
		mocks.getDashboard.mockResolvedValue({
			variant: "me",
			cards: [
				{
					type: "hero_summary",
					title: "Today",
					data: {
						today: "2026-06-20",
						working_day: "Saturday",
						next_payroll_date: "2026-06-28",
						days_to_payroll: 8,
					},
				},
				{
					type: "pending_tasks",
					title: "Pending tasks",
					data: {
						tasks: [
							{
								key: "leave_approvals",
								label: "Leave approvals",
								count: 3,
								tone: "peach",
								action_route: "/approvals",
							},
						],
					},
				},
			],
		});
		renderPage();
		await waitFor(() => {
			expect(screen.getByText(/Ops/)).toBeInTheDocument();
		});
		expect(screen.getByText("Leave approvals")).toBeInTheDocument();
		expect(screen.getByText("Quick actions")).toBeInTheDocument();
		expect(screen.getByText(/until payroll/)).toBeInTheDocument();
	});

	it("picks the /team variant when team perm is present", async () => {
		mocks.perms = new Set(["dashboard:read:team", "dashboard:read:me"]);
		mocks.getDashboard.mockResolvedValue({
			variant: "team",
			cards: [
				{
					type: "attendance_summary",
					title: "Attendance today",
					data: {
						date: "2026-06-20",
						team_size: 4,
						present: 3,
						late: 1,
						absent: 0,
						on_leave: 0,
						partial: 0,
					},
				},
			],
		});
		renderPage();
		await waitFor(() => {
			expect(screen.getByText("Attendance today")).toBeInTheDocument();
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
