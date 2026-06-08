import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ForcePasswordChangePage from "./ForcePasswordChangePage";

const navigate = vi.fn();
const clearMustChangePassword = vi.fn();
const postMock = vi.fn();

vi.mock("react-router-dom", async () => {
	const actual =
		await vi.importActual<typeof import("react-router-dom")>(
			"react-router-dom",
		);
	return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/lib/auth", () => ({
	useAuth: () => ({ clearMustChangePassword }),
}));

vi.mock("@/lib/api", () => ({
	api: { POST: (...args: unknown[]) => postMock(...args) },
}));

function renderPage() {
	return render(
		<MemoryRouter>
			<ForcePasswordChangePage />
		</MemoryRouter>,
	);
}

describe("ForcePasswordChangePage", () => {
	beforeEach(() => {
		navigate.mockReset();
		clearMustChangePassword.mockReset();
		postMock.mockReset();
	});

	it("submits new password and navigates on success", async () => {
		const user = userEvent.setup();
		postMock.mockResolvedValue({ data: { detail: "ok" }, error: undefined });
		renderPage();

		await user.type(screen.getByLabelText("New password"), "supersecret1");
		await user.type(screen.getByLabelText("Confirm password"), "supersecret1");
		await user.click(screen.getByRole("button", { name: /set password/i }));

		await waitFor(() => {
			expect(postMock).toHaveBeenCalledWith(
				"/api/v1/auth/password/change",
				expect.objectContaining({
					body: expect.objectContaining({ new_password: "supersecret1" }),
				}),
			);
		});
		await waitFor(() => expect(clearMustChangePassword).toHaveBeenCalled());
		expect(navigate).toHaveBeenCalledWith("/");
	});

	it("shows error when passwords do not match", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.type(screen.getByLabelText("New password"), "supersecret1");
		await user.type(screen.getByLabelText("Confirm password"), "different12");
		await user.click(screen.getByRole("button", { name: /set password/i }));

		expect(screen.getByRole("alert")).toHaveTextContent(/do not match/i);
		expect(postMock).not.toHaveBeenCalled();
	});

	it("shows error for too-short password", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.type(screen.getByLabelText("New password"), "short");
		await user.type(screen.getByLabelText("Confirm password"), "short");
		await user.click(screen.getByRole("button", { name: /set password/i }));

		expect(screen.getByRole("alert")).toHaveTextContent(/at least 8/i);
		expect(postMock).not.toHaveBeenCalled();
	});
});
