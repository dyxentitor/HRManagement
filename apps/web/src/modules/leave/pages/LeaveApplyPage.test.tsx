import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth";

// Mock employeeApi so the "no employee" gate resolves with a record
// (without this, the test environment can't reach the live API and throws)
vi.mock("@/modules/employee/api", () => ({
	employeeApi: {
		getMe: vi.fn().mockResolvedValue({ id: "emp-1", full_name: "Test User" }),
		list: vi.fn().mockResolvedValue([]),
	},
}));

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
