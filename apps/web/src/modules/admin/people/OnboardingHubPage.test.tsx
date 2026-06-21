import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inv = vi.hoisted(() => ({ list: vi.fn() }));
const ob = vi.hoisted(() => ({ progress: vi.fn() }));
vi.mock("../invitations-api", async (orig) => ({
	...(await orig<typeof import("../invitations-api")>()),
	invitationsApi: inv,
}));
vi.mock("./onboarding-board-api", async (orig) => ({
	...(await orig<typeof import("./onboarding-board-api")>()),
	onboardingBoardApi: ob,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import OnboardingHubPage from "./OnboardingHubPage";

beforeEach(() => {
	inv.list.mockResolvedValue([
		{
			id: "i1",
			user_id: "u1",
			employee_id: null,
			email: "j@x.com",
			effective_status: "sent",
			status: "sent",
			expires_at: new Date(Date.now() + 40 * 3_600_000).toISOString(),
			sent_at: null,
			opened_at: null,
			activated_at: null,
			revoked_at: null,
			sent_count: 1,
			created_at: "",
			employee_name: "John Smith",
			department: "Eng",
		},
	]);
	ob.progress.mockResolvedValue([
		{
			user_id: "u2",
			employee_id: "e2",
			name: "Aisyah Lim",
			email: "a@x.com",
			department: "Ops",
			invitation_status: "activated",
			invitation_sent_at: null,
			invitation_expires_at: "2999-01-01",
			account_activated: true,
			profile_percent: 60,
			profile_missing: ["bank_details"],
			mfa_enabled: true,
			wizard_step: "preferences",
			wizard_completed: false,
			checklist_id: null,
			checklist_done: 0,
			checklist_total: 0,
			overall: "in_progress",
		},
	]);
});

describe("OnboardingHubPage", () => {
	it("shows both columns — invitations and onboarding progress", async () => {
		render(
			<MemoryRouter>
				<OnboardingHubPage />
			</MemoryRouter>,
		);
		await waitFor(() => expect(screen.getByText("／ Invitations")).toBeInTheDocument());
		expect(screen.getByText("／ Onboarding progress")).toBeInTheDocument();
		// names show in both the hero "next up" callout and the row
		expect(screen.getAllByText("John Smith").length).toBeGreaterThan(0); // invitation
		expect(screen.getAllByText("Aisyah Lim").length).toBeGreaterThan(0); // onboarding
	});
});
