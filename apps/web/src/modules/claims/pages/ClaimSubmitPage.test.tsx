import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/employee/api", () => ({
	employeeApi: { getMe: vi.fn().mockResolvedValue({ id: "emp-1" }) },
}));

const mocks = vi.hoisted(() => ({ listCategories: vi.fn() }));
vi.mock("../api", () => ({ claimsApi: { listCategories: mocks.listCategories } }));

import ClaimSubmitPage from "./ClaimSubmitPage";

const cats = [
	{ id: "c1", code: "TRAVEL", name: "Travel", requires_attachment: false, currency_code: "MYR" },
];

function renderPage() {
	render(
		<MemoryRouter>
			<ClaimSubmitPage />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	mocks.listCategories.mockReset().mockResolvedValue(cats);
});

describe("ClaimSubmitPage", () => {
	it("renders the form fields, the live summary and a disabled submit when empty", async () => {
		renderPage();
		expect(await screen.findByRole("heading", { name: /submit a claim/i })).toBeInTheDocument();
		// form fields
		expect(screen.getByLabelText("Amount")).toBeInTheDocument();
		expect(screen.getByLabelText("Expense date")).toBeInTheDocument();
		// receipt dropzone
		expect(screen.getByText(/drag receipts here/i)).toBeInTheDocument();
		// live summary panel
		expect(screen.getByText(/claim summary/i)).toBeInTheDocument();
		expect(screen.getByText(/typical turnaround/i)).toBeInTheDocument();
		// nothing entered → submit disabled
		expect(screen.getByRole("button", { name: /submit claim/i })).toBeDisabled();
	});
});
