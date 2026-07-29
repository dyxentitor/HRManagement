import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const overview = vi.hoisted(() => vi.fn());
const claimsList = vi.hoisted(() => vi.fn());
const customersList = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({
	incentiveApi: {
		overview,
		claims: { list: claimsList, approve: vi.fn(), reject: vi.fn() },
		customers: {
			list: customersList,
			create: vi.fn(),
			topUp: vi.fn(),
			update: vi.fn(),
			deactivate: vi.fn(),
			reactivate: vi.fn(),
		},
		projects: {
			list: vi.fn().mockResolvedValue([]),
			create: vi.fn(),
			update: vi.fn(),
			close: vi.fn(),
			reopen: vi.fn(),
		},
	},
}));

const useCan = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/lib/perm", () => ({ useCan }));

import IncentiveAdminPage from "./IncentiveAdminPage";

const OV = {
	kpis: {
		total_projects: 9,
		active_projects: 7,
		closed_projects: 2,
		pool_total: "540",
		pool_remaining: "312",
		allocated_budget: "228",
		consumed: "146",
		pending_claims: 5,
		approved_claims: 18,
		rejected_claims: 2,
		payout_rm_quarter: "11400",
		soc_projects: 3,
		rate: "50",
	},
	pools: [
		{ id: "c1", name: "Acme", project_count: 2, remaining: "120", total: "200", pct_used: 40 },
	],
	projects: [
		{
			id: "p1",
			name: "Acme Pentest",
			customer_name: "Acme",
			manager_id: "m1",
			budget: "40",
			consumed: "28",
			remaining: "12",
			status: "open",
			include_soc: true,
			deadline: null,
		},
	],
	consumption: [{ quarter: "2026-Q3", mandays: "146" }],
	claim_breakdown: { approved: 18, pending: 5, rejected: 2 },
	top_contributors: [
		{ employee_id: "e1", name: "Tan Wei", department: "Eng", mandays: "45", rm: "2250" },
	],
	recent_activity: [
		{
			type: "claim_payout",
			label_type: "Claim approved",
			mandays: "5",
			target: "Acme Pentest",
			created_at: "",
		},
	],
	deadlines: [
		{
			id: "p1",
			name: "Acme Pentest",
			customer_name: "Acme",
			deadline: "2026-09-30",
			overdue: false,
		},
	],
};

beforeEach(() => {
	overview.mockReset().mockResolvedValue(OV);
	claimsList.mockReset().mockResolvedValue([]);
	customersList.mockReset().mockResolvedValue([]);
});

describe("IncentiveAdminPage (command center)", () => {
	it("renders the hero headline + executive KPIs from the overview", async () => {
		render(<IncentiveAdminPage />);
		await waitFor(() => expect(screen.getByText("RM 11,400")).toBeInTheDocument());
		expect(screen.getByRole("heading", { name: /Incentive/ })).toBeInTheDocument();
		expect(screen.getByText("Mandays remaining")).toBeInTheDocument();
		expect(screen.getByText("Top contributors")).toBeInTheDocument();
		expect(screen.getByText("Tan Wei")).toBeInTheDocument();
		// projects table + deadline widget present (the project name appears in several widgets)
		expect(screen.getAllByText("Acme Pentest").length).toBeGreaterThan(0);
		expect(screen.getByText("Upcoming deadlines")).toBeInTheDocument();
	});
});
