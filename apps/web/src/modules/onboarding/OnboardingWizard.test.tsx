import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
	user: null as unknown,
	loading: false,
	refreshMe: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));

const apis = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/modules/auth/activation-api", () => ({
	verifyInvitation: apis.verify,
	activateInvitation: vi.fn(),
}));
vi.mock("./onboarding-api", () => ({ onboardingApi: { setStep: vi.fn(), complete: vi.fn() } }));

import { OnboardingWizard } from "./OnboardingWizard";

function renderAt(entry: string) {
	render(
		<MemoryRouter initialEntries={[entry]}>
			<Routes>
				<Route path="/activate" element={<OnboardingWizard mode="activate" />} />
				<Route path="/login" element={<div>Login</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

beforeEach(() => {
	apis.verify.mockReset();
	auth.refreshMe.mockReset();
});

describe("OnboardingWizard", () => {
	it("welcomes the hire then advances to the Security step", async () => {
		const user = userEvent.setup();
		apis.verify.mockResolvedValue({
			full_name: "Aisyah Lim",
			email: "aisyah@x.com",
			org_name: "Provintell",
		});
		renderAt("/activate?token=abc");

		await waitFor(() => expect(screen.getByText(/welcome to Provintell/i)).toBeInTheDocument());
		expect(screen.getByText(/Hi Aisyah/)).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /Let's get started/i }));
		// Security step (password phase)
		expect(screen.getByText(/Secure your account/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/Create password/i)).toBeInTheDocument();
	});

	it("shows an unavailable state when the token is missing/invalid", async () => {
		apis.verify.mockRejectedValue(new Error("bad"));
		renderAt("/activate?token=bad");
		await waitFor(() => expect(screen.getByText(/Invitation unavailable/i)).toBeInTheDocument());
	});
});
