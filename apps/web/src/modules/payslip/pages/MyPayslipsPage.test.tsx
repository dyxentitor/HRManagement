import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listMine: vi.fn(), retrieve: vi.fn() }));
vi.mock("../api", () => ({ payslipApi: { listMine: mocks.listMine, retrieve: mocks.retrieve } }));

import MyPayslipsPage from "./MyPayslipsPage";

const base = {
	employee_id: "e",
	period: "p",
	period_end: "2026-06-30",
	currency_code: "MYR",
	components: { Basic: "5000", Allowance: "1000" },
	deductions: { EPF: "660", PCB: "519.50" },
	pdf_s3_key: "k",
	pdf_generated_at: null,
	status: "published" as const,
	source: "csv",
};

const payslips = [
	{
		...base,
		id: "ps1",
		period_start: "2026-06-01",
		pay_date: "2026-06-28",
		gross: "6000",
		net: "4820.50",
		pdf_url: "https://minio/jun.pdf",
		published_at: "2026-06-28T00:00:00Z",
		created_at: "2026-06-28T00:00:00Z",
	},
];

beforeEach(() => {
	mocks.listMine.mockReset().mockResolvedValue(payslips);
	mocks.retrieve.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
	render(<MyPayslipsPage />);
}

describe("MyPayslipsPage", () => {
	it("shows the latest take-home, breakdown and history", async () => {
		renderPage();
		await waitFor(() => expect(screen.getByText(/Take-home · June 2026/i)).toBeInTheDocument());
		// big net pay
		expect(screen.getAllByText(/MYR 4,820.50/).length).toBeGreaterThan(0);
		// breakdown earnings + deductions
		expect(screen.getByText("Basic")).toBeInTheDocument();
		expect(screen.getByText("EPF")).toBeInTheDocument();
		// history
		expect(screen.getByText(/Payslip history/i)).toBeInTheDocument();
	});

	it("opens a payslip PDF in a new tab", async () => {
		const user = userEvent.setup();
		const openSpy = vi.fn();
		vi.stubGlobal("open", openSpy);
		renderPage();
		await waitFor(() => screen.getByText(/Take-home/i));
		await user.click(screen.getByRole("button", { name: /Download payslip/i }));
		expect(openSpy).toHaveBeenCalledWith("https://minio/jun.pdf", "_blank", "noopener,noreferrer");
	});
});
