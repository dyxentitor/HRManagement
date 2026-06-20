import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth";

vi.mock("@/modules/employee/api", () => ({
	employeeApi: {
		getMe: vi.fn().mockResolvedValue({ id: "emp-1", full_name: "Test User" }),
		list: vi.fn().mockResolvedValue([]),
	},
}));

import LeaveApplyPage from "./LeaveApplyPage";

function renderPage() {
	render(
		<MemoryRouter>
			<AuthProvider>
				<LeaveApplyPage />
			</AuthProvider>
		</MemoryRouter>,
	);
}

describe("LeaveApplyPage (A2)", () => {
	it("renders the heading, type picker, and a disabled submit when empty", async () => {
		const leaveModule = await import("../api");
		vi.spyOn(leaveModule.leaveApi, "listTypes").mockResolvedValue([
			{ id: "lt-1", code: "ANNUAL", name: "Annual", is_paid: true, is_statutory: false },
		]);
		vi.spyOn(leaveModule.leaveApi, "myBalances").mockResolvedValue([]);
		vi.spyOn(leaveModule.leaveApi, "holidays").mockResolvedValue([]);

		renderPage();
		expect(
			await screen.findByRole("heading", { name: /apply for leave/i }),
		).toBeInTheDocument();
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /submit request/i })).toBeDisabled(),
		);
		expect(screen.getByText(/Request summary/i)).toBeInTheDocument();
	});
});
