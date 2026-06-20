import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listMine: vi.fn(),
	listCategories: vi.fn(),
	cancel: vi.fn(),
}));

vi.mock("../api", () => ({
	claimsApi: {
		listMine: mocks.listMine,
		listCategories: mocks.listCategories,
		cancel: mocks.cancel,
	},
}));

import MyClaimsPage from "./MyClaimsPage";

const claims = [
	{
		id: "cl1",
		employee: "e",
		category: "c",
		category_code: "MEDICAL",
		amount: "280",
		currency_code: "MYR",
		expense_date: "2026-06-18",
		description: "Clinic",
		merchant: "Clinic A",
		status: "submitted",
		current_level: 1,
		submitted_at: "2026-06-18T00:00:00Z",
		reimbursed_at: null,
		reimbursement_reference: "",
		attachments: [],
	},
	{
		id: "cl2",
		employee: "e",
		category: "c",
		category_code: "TRAVEL",
		amount: "620",
		currency_code: "MYR",
		expense_date: "2026-06-12",
		description: "KL trip",
		merchant: "Grab",
		status: "reimbursed",
		current_level: 3,
		submitted_at: "2026-06-12T00:00:00Z",
		reimbursed_at: "2026-06-15T00:00:00Z",
		reimbursement_reference: "REF1",
		attachments: [],
	},
];

const categories = [
	{ id: "c1", code: "MEDICAL", name: "Medical", requires_attachment: true, currency_code: "MYR" },
];

function renderPage() {
	render(
		<MemoryRouter>
			<MyClaimsPage />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	mocks.listMine.mockReset();
	mocks.listCategories.mockReset();
	mocks.listCategories.mockResolvedValue(categories);
});

describe("MyClaimsPage", () => {
	it("renders the hero, summary cards, categories and recent claims", async () => {
		mocks.listMine.mockResolvedValue(claims);
		renderPage();
		await waitFor(() => expect(screen.getByText("My Claims")).toBeInTheDocument());
		// summary buckets
		expect(screen.getByText(/Pending ·/)).toBeInTheDocument();
		expect(screen.getByText(/Paid ·/)).toBeInTheDocument();
		// category quick-launch + how it works
		expect(screen.getByText(/pick a category/i)).toBeInTheDocument();
		expect(screen.getByText(/How claims work/i)).toBeInTheDocument();
		// a recent claim row
		expect(screen.getByText(/Grab/)).toBeInTheDocument();
	});

	it("shows a guidance hero + Submit CTA when there are no claims", async () => {
		mocks.listMine.mockResolvedValue([]);
		renderPage();
		await waitFor(() => expect(screen.getByText(/Submit your first claim/i)).toBeInTheDocument());
		expect(screen.getByRole("link", { name: /Submit a claim/i })).toHaveAttribute(
			"href",
			"/claims/submit",
		);
	});
});
