import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	progress: vi.fn(),
	getChecklist: vi.fn(),
	startChecklist: vi.fn(),
	toggleItem: vi.fn(),
}));
vi.mock("./onboarding-board-api", async (orig) => ({
	...(await orig<typeof import("./onboarding-board-api")>()),
	onboardingBoardApi: api,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import OnboardingBoardPage from "./OnboardingBoardPage";

const rows = [
	{
		user_id: "u1",
		employee_id: "e1",
		name: "John Smith",
		email: "j@x.com",
		department: "Engineering",
		invitation_status: "opened",
		invitation_sent_at: null,
		invitation_expires_at: "2999-01-01",
		account_activated: true,
		profile_percent: 80,
		profile_missing: ["bank_details"],
		mfa_enabled: true,
		wizard_step: "profile",
		wizard_completed: false,
		checklist_id: null,
		checklist_done: 0,
		checklist_total: 0,
		overall: "in_progress" as const,
	},
];

beforeEach(() => {
	for (const m of Object.values(api)) m.mockReset();
	api.progress.mockResolvedValue(rows);
});

describe("OnboardingBoardPage", () => {
	it("renders the funnel, a hire row and an overall status", async () => {
		render(<OnboardingBoardPage />);
		await waitFor(() => expect(screen.getByText("John Smith")).toBeInTheDocument());
		expect(screen.getByText("Onboarding progress")).toBeInTheDocument();
		expect(screen.getByText("In progress")).toBeInTheDocument();
		// step labels present
		expect(screen.getByText("Password")).toBeInTheDocument();
	});

	it("opens a detail drawer with the at-a-glance cards", async () => {
		const user = userEvent.setup();
		render(<OnboardingBoardPage />);
		await waitFor(() => screen.getByText("John Smith"));
		await user.click(screen.getByRole("button", { name: /John Smith/i }));
		await waitFor(() => expect(screen.getByText("Two-factor")).toBeInTheDocument());
		expect(screen.getByText(/80% · bank_details missing/)).toBeInTheDocument();
	});
});
