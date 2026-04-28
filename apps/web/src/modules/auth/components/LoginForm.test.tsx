import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth";

import { LoginForm } from "./LoginForm";

// AuthProvider calls /api/v1/auth/me on mount — return empty (no token stored)
// so loading resolves immediately without a real network call.

describe("LoginForm", () => {
	it("renders email + password fields", async () => {
		render(
			<MemoryRouter>
				<AuthProvider>
					<LoginForm />
				</AuthProvider>
			</MemoryRouter>,
		);
		// Wait for AuthProvider loading to resolve
		await waitFor(() =>
			expect(screen.getByLabelText("Email")).toBeInTheDocument(),
		);
		expect(screen.getByLabelText("Password")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /sign in/i }),
		).toBeInTheDocument();
	});

	it("shows error on failed login", async () => {
		const user = userEvent.setup();
		vi.spyOn(global, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ detail: "Invalid" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
		);

		render(
			<MemoryRouter>
				<AuthProvider>
					<LoginForm />
				</AuthProvider>
			</MemoryRouter>,
		);

		await waitFor(() =>
			expect(screen.getByLabelText("Email")).toBeInTheDocument(),
		);
		await user.type(screen.getByLabelText("Email"), "x@example.com");
		await user.type(screen.getByLabelText("Password"), "bad");
		await user.click(screen.getByRole("button", { name: /sign in/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeInTheDocument();
		});
	});
});
