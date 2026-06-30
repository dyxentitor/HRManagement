import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bonds = vi.hoisted(() => vi.fn());
const projects = vi.hoisted(() => vi.fn());
const claims = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({
	incentiveApi: {
		bonds: { list: bonds, accept: vi.fn() },
		projects: { list: projects },
		claims: { list: claims, create: vi.fn() },
	},
}));

import MyIncentivePage from "./MyIncentivePage";

beforeEach(() => {
	bonds.mockResolvedValue([
		{
			id: "b1",
			employee_id: "e1",
			accepted_at: "2024-01-01T00:00:00Z",
			period_start: "2024-01-01",
			period_end: "2030-01-01",
			terms_version: "v1",
			is_active: true,
			created_at: "",
		},
	]);
	projects.mockResolvedValue([
		{
			id: "p1",
			customer: "c1",
			customer_name: "Acme",
			name: "Pentest",
			description: "",
			budget_mandays: "40",
			manager_id: "m1",
			include_soc: false,
			status: "open",
			mandays_approved: "0",
			mandays_remaining: "40",
			created_at: "",
		},
	]);
	claims.mockResolvedValue([
		{
			id: "cl1",
			project: "p1",
			project_name: "Pentest",
			employee_id: "e1",
			mandays: "5",
			note: "",
			status: "pending",
			reviewed_by: null,
			reviewed_at: null,
			reject_reason: "",
			billing_quarter: "",
			payout_status: "",
			created_at: "",
		},
	]);
});

describe("MyIncentivePage", () => {
	it("shows eligibility, a claimable project, and my claims", async () => {
		render(<MyIncentivePage />);
		await waitFor(() => expect(screen.getByText("Eligible")).toBeInTheDocument());
		expect(screen.getByText(/Pentest · 40 md left/)).toBeInTheDocument();
		expect(screen.getByText("pending")).toBeInTheDocument();
	});
});
