import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const me = vi.hoisted(() => vi.fn());
const accept = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const cancel = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({
	incentiveApi: {
		me,
		bonds: { accept },
		claims: { create, update, cancel },
	},
}));

import MyIncentivePage from "./MyIncentivePage";

const claim = (over: Record<string, unknown>) => ({
	id: "c",
	project: "p1",
	project_name: "Acme Pentest",
	employee_id: "e1",
	mandays: "5",
	note: "",
	status: "pending",
	reviewed_by: null,
	reviewed_at: null,
	reject_reason: "",
	billing_quarter: "",
	payout_status: "",
	created_at: "2026-06-28T00:00:00Z",
	...over,
});

const summary = {
	has_employee: true,
	rate: "50",
	eligibility: {
		has_bond: true,
		bond_id: "b1",
		accepted: true,
		accepted_at: "2026-01-12T00:00:00Z",
		period_start: "2026-01-12",
		period_end: "2026-09-30",
		is_active: true,
		days_remaining: 91,
		terms_version: "v1",
	},
	earnings: {
		earned_mandays: "48",
		earned_rm: "2400",
		pending_mandays: "6",
		pending_rm: "300",
		this_quarter_mandays: "18",
		this_quarter_rm: "900",
		paid_mandays: "24",
		paid_rm: "1200",
	},
	claim_counts: { pending: 1, approved: 1, rejected: 1, cancelled: 0, paid: 1 },
	claims: [
		claim({ id: "c1", status: "pending", mandays: "5" }),
		claim({
			id: "c2",
			project: "p2",
			project_name: "Globex SOC",
			status: "rejected",
			mandays: "12",
			reviewed_at: "2026-06-24T00:00:00Z",
			reject_reason: "too coarse — split it",
		}),
	],
	trend: [
		{ quarter: "2026-Q2", mandays: "10", rm: "500" },
		{ quarter: "2026-Q3", mandays: "18", rm: "900" },
	],
	my_projects: [
		{
			id: "p1",
			name: "Acme Pentest",
			customer_name: "Acme",
			my_mandays: "13",
			budget: "40",
			consumed: "26",
		},
	],
	claimable_projects: [
		{ id: "p3", name: "Wayne Cloud", customer_name: "Wayne", remaining: "28", deadline: "2026-08-15" },
	],
	payout: { quarter: "2026-Q3", mandays: "8", rm: "400", pending_ct: 1, in_payroll_ct: 0, paid_ct: 0 },
};

beforeEach(() => {
	me.mockResolvedValue(structuredClone(summary));
	accept.mockResolvedValue({});
	create.mockResolvedValue({});
	update.mockResolvedValue({});
	cancel.mockResolvedValue({});
});

describe("MyIncentivePage", () => {
	it("renders the status-first hero and eligibility", async () => {
		render(<MyIncentivePage />);
		await waitFor(() => expect(screen.getByText("My Mandays")).toBeInTheDocument());
		// earned mandays headline (also appears in the KPI card)
		expect(screen.getAllByText("48").length).toBeGreaterThan(0);
		expect(screen.getByText(/Bond active/)).toBeInTheDocument();
		expect(screen.getByText(/RM 2,400/)).toBeInTheDocument();
	});

	it("exposes Edit + Cancel on a pending claim and opens the edit composer", async () => {
		const user = userEvent.setup();
		render(<MyIncentivePage />);
		await waitFor(() => expect(screen.getByText("My Mandays")).toBeInTheDocument());
		expect(screen.getByText("Edit")).toBeInTheDocument();
		expect(screen.getByText("Cancel")).toBeInTheDocument();
		await user.click(screen.getByText("Edit"));
		expect(screen.getByText("Edit claim")).toBeInTheDocument();
	});

	it("shows the reject reason and a Resubmit action on a rejected claim", async () => {
		const user = userEvent.setup();
		render(<MyIncentivePage />);
		await waitFor(() => expect(screen.getByText("My Mandays")).toBeInTheDocument());
		expect(screen.getByText(/too coarse/)).toBeInTheDocument();
		await user.click(screen.getByText("Resubmit"));
		expect(screen.getByText("Resubmit claim")).toBeInTheDocument();
	});
});
