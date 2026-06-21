import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	myCertifications: vi.fn(),
	myAssignments: vi.fn(),
	createCertification: vi.fn(),
	uploadCertificationDocument: vi.fn(),
	downloadDocument: vi.fn(),
	completeAssignment: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({ useFeature: () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../api", () => ({ certificationApi: mocks }));

import GrowthPage from "./GrowthPage";

const certs = [
	{
		id: "c1",
		employee_id: "e",
		name: "CISSP",
		issuer: "ISC²",
		certificate_number: "",
		issued_on: "2024-03-01",
		expires_on: "2999-01-01",
		document_s3_key: "certifications/c1/document.pdf",
		status: "active" as const,
		reminder_sent_30d: false,
		reminder_sent_60d: false,
		reminder_sent_90d: false,
		created_at: "",
		updated_at: "",
	},
];
const assignments = [
	{
		id: "a1",
		plan: "p1",
		plan_name: "Security Awareness",
		employee_id: "e",
		assigned_by: "m",
		due_date: "2999-06-10",
		status: "assigned" as const,
		completed_at: null,
		evidence_s3_key: "",
		progress: [],
		created_at: "",
		updated_at: "",
	},
];

beforeEach(() => {
	for (const m of Object.values(mocks)) m.mockReset();
	mocks.myCertifications.mockResolvedValue(certs);
	mocks.myAssignments.mockResolvedValue(assignments);
	mocks.createCertification.mockResolvedValue({ ...certs[0], id: "new" });
	mocks.uploadCertificationDocument.mockResolvedValue(certs[0]);
	mocks.downloadDocument.mockResolvedValue({
		url: "https://minio/c1.pdf",
		filename: "document.pdf",
	});
});
afterEach(() => vi.unstubAllGlobals());

describe("GrowthPage", () => {
	it("renders both columns — certifications and training", async () => {
		render(<GrowthPage />);
		await waitFor(() => expect(screen.getByText("Compliance")).toBeInTheDocument());
		expect(screen.getByText("Learning")).toBeInTheDocument();
		// CISSP shows in both the hero "next up" callout and the row
		expect(screen.getAllByText("CISSP").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Security Awareness").length).toBeGreaterThan(0);
	});

	it("opens an uploaded certificate document", async () => {
		const user = userEvent.setup();
		const openSpy = vi.fn();
		vi.stubGlobal("open", openSpy);
		render(<GrowthPage />);
		const viewBtn = await screen.findByRole("button", { name: /view/i });
		await user.click(viewBtn);
		await waitFor(() => expect(mocks.downloadDocument).toHaveBeenCalledWith("c1"));
		expect(openSpy).toHaveBeenCalledWith("https://minio/c1.pdf", "_blank", "noopener,noreferrer");
	});

	it("adds a certificate with an attached document", async () => {
		const user = userEvent.setup();
		render(<GrowthPage />);
		await waitFor(() => screen.getByText("Compliance"));
		await user.click(screen.getByRole("button", { name: /^add$/i }));

		const dialog = await screen.findByRole("dialog");
		await user.type(within(dialog).getByPlaceholderText(/CISSP/i), "AWS SA");
		// issue date (first date input) — fireEvent.change so React state updates
		const dateInputs = dialog.querySelectorAll('input[type="date"]');
		fireEvent.change(dateInputs[0], { target: { value: "2025-01-01" } });

		const file = new File(["x"], "cert.pdf", { type: "application/pdf" });
		const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
		await user.upload(fileInput, file);

		await user.click(within(dialog).getByRole("button", { name: /add certificate/i }));
		await waitFor(() => expect(mocks.createCertification).toHaveBeenCalled());
		expect(mocks.uploadCertificationDocument).toHaveBeenCalledWith("new", file);
	});
});
