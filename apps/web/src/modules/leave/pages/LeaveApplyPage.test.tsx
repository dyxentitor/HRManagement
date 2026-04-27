import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth";

import LeaveApplyPage from "./LeaveApplyPage";

describe("LeaveApplyPage", () => {
	it("renders the apply heading and disabled submit when fields are empty", async () => {
		vi.spyOn(global, "fetch").mockResolvedValue(
			new Response(JSON.stringify([]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		render(
			<MemoryRouter>
				<AuthProvider>
					<LeaveApplyPage />
				</AuthProvider>
			</MemoryRouter>,
		);

		expect(
			await screen.findByRole("heading", { name: /apply for leave/i }),
		).toBeInTheDocument();
		const submit = screen.getByRole("button", { name: /apply/i });
		expect(submit).toBeDisabled();
	});
});
