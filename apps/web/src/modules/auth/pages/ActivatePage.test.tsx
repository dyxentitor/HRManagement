import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), activate: vi.fn() }));
vi.mock("../activation-api", () => ({
	verifyInvitation: mocks.verify,
	activateInvitation: mocks.activate,
}));

import ActivatePage from "./ActivatePage";

function renderAt(url: string) {
	render(
		<MemoryRouter initialEntries={[url]}>
			<Routes>
				<Route path="/activate" element={<ActivatePage />} />
				<Route path="/login" element={<div>Sign in screen</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

beforeEach(() => {
	mocks.verify.mockReset();
	mocks.activate.mockReset();
});

describe("ActivatePage", () => {
	it("verifies the token then lets the new hire set a password", async () => {
		const user = userEvent.setup();
		mocks.verify.mockResolvedValue({
			full_name: "Aisyah Lim",
			email: "aisyah@x.com",
			org_name: "Provintell",
			expires_at: new Date().toISOString(),
			status: "opened",
		});
		mocks.activate.mockResolvedValue(undefined);
		renderAt("/activate?token=abc");

		await waitFor(() => expect(screen.getByText(/Hi Aisyah Lim/)).toBeInTheDocument());
		expect(screen.getByText(/Welcome to Provintell/)).toBeInTheDocument();

		await user.type(screen.getByLabelText(/Create password/i), "supersecret1");
		await user.type(screen.getByLabelText(/Confirm password/i), "supersecret1");
		await user.click(screen.getByRole("button", { name: /Activate my account/i }));

		await waitFor(() => expect(mocks.activate).toHaveBeenCalledWith("abc", "supersecret1"));
		expect(screen.getByText(/Welcome aboard/)).toBeInTheDocument();
	});

	it("shows an unavailable state for an invalid/expired token", async () => {
		mocks.verify.mockRejectedValue(new Error("invalid"));
		renderAt("/activate?token=bad");
		await waitFor(() => expect(screen.getByText(/Invitation unavailable/)).toBeInTheDocument());
	});
});
