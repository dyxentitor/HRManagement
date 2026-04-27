import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth";

import KpiAdminPage from "./KpiAdminPage";

describe("KpiAdminPage", () => {
	it("renders heading", async () => {
		vi.spyOn(global, "fetch").mockResolvedValue(
			new Response(JSON.stringify([]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		render(
			<MemoryRouter>
				<AuthProvider>
					<KpiAdminPage />
				</AuthProvider>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: /kpi admin/i }),
			).toBeInTheDocument();
		});
	});

	it("shows new cycle form when button clicked", async () => {
		const user = userEvent.setup();
		vi.spyOn(global, "fetch").mockResolvedValue(
			new Response(JSON.stringify([]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		render(
			<MemoryRouter>
				<AuthProvider>
					<KpiAdminPage />
				</AuthProvider>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: /kpi admin/i }),
			).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /\+ new cycle/i }));
		await waitFor(() => {
			expect(
				screen.getByRole("form", { name: /new-cycle-form/i }),
			).toBeInTheDocument();
		});
	});

	it("create cycle button disabled when name is empty", async () => {
		const user = userEvent.setup();
		vi.spyOn(global, "fetch").mockResolvedValue(
			new Response(JSON.stringify([]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		render(
			<MemoryRouter>
				<AuthProvider>
					<KpiAdminPage />
				</AuthProvider>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: /kpi admin/i }),
			).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /\+ new cycle/i }));
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /create cycle/i }),
			).toBeDisabled();
		});
	});
});
