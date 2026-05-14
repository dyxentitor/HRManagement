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

	it("surfaces the backend's RFC 7807 errors[0].message on submit failure", async () => {
		// Regression for v1.10.1 sweep Bug #4: the toast previously read the
		// bare URL ("POST /api/v1/leave/requests/.../submit/ failed") instead
		// of the backend's specific message. The leaveApi error-formatting
		// helper (_errorMessage in modules/leave/api.ts) is what unblocks
		// this; the page just renders the thrown Error.message.
		const user = (await import("@testing-library/user-event")).default.setup();
		const leaveModule = await import("../api");

		vi.spyOn(leaveModule.leaveApi, "listTypes").mockResolvedValue([
			{
				id: "lt-1",
				code: "PATERNITY",
				name: "Paternity Leave",
				is_paid: true,
				is_statutory: true,
			},
		]);
		vi.spyOn(leaveModule.leaveApi, "apply").mockResolvedValue({
			id: "lr-1",
			employee_id: "emp-1",
			leave_type: "lt-1",
			leave_type_code: "PATERNITY",
			start_date: "2026-05-18",
			end_date: "2026-05-18",
			total_days: "1.00",
			is_half_day: false,
			half_day_period: "",
			reason: "test",
			status: "draft",
			current_level: 0,
			submitted_at: null,
			decided_at: null,
		});
		vi.spyOn(leaveModule.leaveApi, "submit").mockRejectedValue(
			new Error("Paternity Leave requires 30 days of advance notice."),
		);

		render(
			<MemoryRouter>
				<AuthProvider>
					<LeaveApplyPage />
				</AuthProvider>
			</MemoryRouter>,
		);

		await screen.findByRole("heading", { name: /apply for leave/i });
		await screen.findByRole("option", { name: /paternity/i });
		const select = screen.getByRole("combobox", { name: /leave type/i });
		await user.selectOptions(select, "lt-1");
		const start = screen.getByLabelText(/start date/i);
		const end = screen.getByLabelText(/end date/i);
		await user.type(start, "2026-05-18");
		await user.type(end, "2026-05-18");

		await user.click(screen.getByRole("button", { name: /apply/i }));

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(
			/Paternity Leave requires 30 days of advance notice\./i,
		);
		expect(alert).not.toHaveTextContent(/POST .* failed/i);
	});
});

describe("leaveApi error message extraction", () => {
	it("extracts errors[0].message from RFC 7807 body", async () => {
		const { default: createClient } = await import("openapi-fetch");
		const errorBody = {
			type: "about:blank",
			title: "Validation failed",
			status: 400,
			detail: "One or more fields failed validation.",
			errors: [
				{
					field: "start_date",
					code: "invalid",
					message: "Paternity Leave requires 30 days of advance notice.",
				},
			],
		};
		vi.spyOn(global, "fetch").mockResolvedValue(
			new Response(JSON.stringify(errorBody), {
				status: 400,
				headers: { "Content-Type": "application/problem+json" },
			}),
		);
		// Sanity: openapi-fetch must be present (lazy import keeps Vitest fast)
		expect(createClient).toBeDefined();

		const { leaveApi } = await import("../api");
		await expect(leaveApi.submit("any")).rejects.toThrow(
			/Paternity Leave requires 30 days of advance notice\./,
		);
	});
});
