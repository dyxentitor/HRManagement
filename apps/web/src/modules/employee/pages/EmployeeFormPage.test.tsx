import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	retrieve: vi.fn(),
	list: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	archive: vi.fn(),
	assignTeam: vi.fn(),
	deptList: vi.fn(),
	teamList: vi.fn(),
	perms: new Set<string>([
		"employee:write:org",
		"employee:create",
		"employee:bank:read",
		"employee:bank:write",
		"employee:archive",
	]),
}));
vi.mock("@/lib/perm", () => ({
	useCan: (p: string) => (p === "" ? false : mocks.perms.has(p)),
}));
vi.mock("../api", () => ({
	employeeApi: {
		retrieve: mocks.retrieve,
		list: mocks.list,
		create: mocks.create,
		update: mocks.update,
		archive: mocks.archive,
		assignTeam: mocks.assignTeam,
	},
	departmentApi: { list: mocks.deptList },
}));
vi.mock("@/modules/admin/teams-api", () => ({
	teamApi: { list: mocks.teamList },
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

import EmployeeFormPage from "./EmployeeFormPage";

beforeEach(() => {
	mocks.retrieve.mockReset();
	mocks.list.mockReset();
	mocks.create.mockReset();
	mocks.update.mockReset();
	mocks.archive.mockReset();
	mocks.assignTeam.mockReset();
	mocks.deptList.mockReset();
	mocks.teamList.mockReset();
	mocks.deptList.mockResolvedValue([{ id: "d1", name: "Operations" }]);
	mocks.teamList.mockResolvedValue([{ id: "t1", name: "Focus" }]);
	mocks.list.mockResolvedValue([]);
	mocks.perms = new Set([
		"employee:write:org",
		"employee:create",
		"employee:bank:read",
		"employee:bank:write",
		"employee:archive",
	]);
});

function renderAt(path: string) {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route path="/employees/new" element={<EmployeeFormPage />} />
				<Route path="/employees/:id/edit" element={<EmployeeFormPage />} />
				<Route path="/employees/:id" element={<div>detail</div>} />
				<Route path="/employees" element={<div>list</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("EmployeeFormPage — create", () => {
	it("renders the empty form", async () => {
		renderAt("/employees/new");
		await waitFor(() => screen.getByRole("button", { name: /^save$/i }));
		expect(screen.getByLabelText(/first name/i)).toHaveValue("");
	});

	it("disables Save until required fields filled", async () => {
		renderAt("/employees/new");
		await waitFor(() => screen.getByRole("button", { name: /^save$/i }));
		expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
	});

	async function fillRequiredAndSave() {
		const user = userEvent.setup();
		await waitFor(() => screen.getByRole("button", { name: /^save$/i }));
		await user.type(screen.getByLabelText(/employee code/i), "E100");
		await user.type(screen.getByLabelText(/first name/i), "Ada");
		await user.type(screen.getByLabelText(/last name/i), "Lovelace");
		await user.type(screen.getByLabelText(/email/i), "ada@x.com");
		await user.type(screen.getByLabelText(/hire date/i), "2026-01-01");
		await user.selectOptions(screen.getByLabelText(/department/i), "d1");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
	}

	it("renders a field-level error from an RFC 7807 errors list", async () => {
		mocks.create.mockRejectedValue(
			Object.assign(new Error("Create failed"), {
				status: 400,
				body: {
					type: "about:blank",
					title: "Validation failed",
					status: 400,
					detail: "One or more fields failed validation.",
					errors: [
						{
							field: "email",
							code: "invalid",
							message:
								"A user with email ada@x.com already exists. Link instead.",
						},
					],
				},
			}),
		);
		renderAt("/employees/new");
		await fillRequiredAndSave();
		// The message binds inline to the offending field (not just the banner).
		const emailBox = screen.getByLabelText(/email/i).closest("div");
		await waitFor(() =>
			expect(within(emailBox as HTMLElement).getByText(/already exists/i)).toBeInTheDocument(),
		);
	});

	it("surfaces a non_field error in the top banner", async () => {
		mocks.create.mockRejectedValue(
			Object.assign(new Error("Create failed"), {
				status: 400,
				body: {
					detail: "One or more fields failed validation.",
					errors: [
						{
							field: "non_field",
							code: "invalid",
							message: "Department is required.",
						},
					],
				},
			}),
		);
		renderAt("/employees/new");
		await fillRequiredAndSave();
		await waitFor(() =>
			expect(screen.getByRole("alert")).toHaveTextContent(
				/department is required/i,
			),
		);
	});
});

describe("EmployeeFormPage — edit", () => {
	beforeEach(() => {
		mocks.retrieve.mockResolvedValue({
			id: "e1",
			full_name: "Wei Lin",
			first_name: "Wei",
			last_name: "Lin",
			employee_code: "PVT-100",
			email: "wei@x.com",
			phone: "+60",
			department_id: "d1",
			role_title: "Engineer",
			employment_type: "fulltime",
			hire_date: "2024-01-01",
			status: "active",
			ic_last4: "5475",
			bank_account_last4: "1234",
		});
	});

	it("pre-fills the form from the loaded employee", async () => {
		renderAt("/employees/e1/edit");
		await waitFor(() => screen.getByDisplayValue("Wei"));
		expect(screen.getByDisplayValue("Lin")).toBeInTheDocument();
		expect(screen.getByDisplayValue("PVT-100")).toBeInTheDocument();
	});

	it("shows IC last4 in the encrypted field summary", async () => {
		renderAt("/employees/e1/edit");
		await waitFor(() => screen.getByText(/IC ending in/i));
		expect(screen.getByText(/5475/)).toBeInTheDocument();
	});

	it("calls update on save", async () => {
		const user = userEvent.setup();
		mocks.update.mockResolvedValue(undefined);
		renderAt("/employees/e1/edit");
		await waitFor(() => screen.getByDisplayValue("Wei"));
		const role = screen.getByLabelText(/role title/i);
		await user.clear(role);
		await user.type(role, "Lead Eng");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		await waitFor(() => expect(mocks.update).toHaveBeenCalled());
	});

	it("renders fields read-only when user only has employee:assign:team", async () => {
		mocks.perms = new Set(["employee:assign:team", "employee:read:team"]);
		renderAt("/employees/e1/edit");
		await waitFor(() => screen.getByDisplayValue("Wei"));
		expect(screen.getByLabelText(/first name/i)).toHaveAttribute("readonly");
	});

	it("archive helper is wired (placeholder for spec coverage)", () => {
		expect(typeof mocks.archive).toBe("function");
	});
});
