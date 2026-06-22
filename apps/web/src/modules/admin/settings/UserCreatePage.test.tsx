import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserCreatePage } from "./UserCreatePage";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
	const actual =
		await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
	return { ...actual, useNavigate: () => navigate };
});

let canCreate = true;
vi.mock("@/lib/perm", () => ({
	useCan: () => canCreate,
}));

vi.mock("../api", () => ({
	roleApi: { list: vi.fn() },
	userApi: { create: vi.fn() },
}));

vi.mock("./settings-api", () => ({
	settingsApi: { listDepartments: vi.fn() },
}));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: { success: () => toast.success(), error: () => toast.error() } }));

import { roleApi, userApi } from "../api";
import { settingsApi } from "./settings-api";

beforeEach(() => {
	vi.clearAllMocks();
	canCreate = true;
	(roleApi.list as ReturnType<typeof vi.fn>).mockResolvedValue([
		{ code: "employee", name: "Employee", is_system: true, member_count: 1 },
		{ code: "hr_manager", name: "HR Manager", is_system: true, member_count: 1 },
	]);
	(settingsApi.listDepartments as ReturnType<typeof vi.fn>).mockResolvedValue([
		{ id: "d1", name: "Engineering", parent: null, head_employee_id: null },
	]);
	(userApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "new-1" });
});

function renderPage() {
	return render(
		<MemoryRouter>
			<UserCreatePage />
		</MemoryRouter>,
	);
}

describe("UserCreatePage", () => {
	it("creates a user-only account", async () => {
		renderPage();
		await waitFor(() => screen.getByLabelText(/company email/i));

		await userEvent.type(screen.getByLabelText(/company email/i), "newhire@x.com");
		await userEvent.type(screen.getByLabelText(/personal email/i), "home@gmail.com");
		await userEvent.selectOptions(
			screen.getByLabelText(/^role/i),
			"hr_manager",
		);
		await userEvent.click(screen.getByRole("button", { name: /create user/i }));

		await waitFor(() => expect(userApi.create).toHaveBeenCalled());
		const body = (userApi.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(body).toMatchObject({
			email: "newhire@x.com",
			role_code: "hr_manager",
			credential_method: "invite",
			// the personal email is where the invite is delivered (login stays the company email)
			invite_email: "home@gmail.com",
		});
		expect(body.employee).toBeUndefined();
	});

	it("creates user + employee when toggled", async () => {
		renderPage();
		await waitFor(() => screen.getByLabelText(/company email/i));

		await userEvent.type(screen.getByLabelText(/company email/i), "newhire@x.com");
		await userEvent.click(
			screen.getByRole("switch", { name: /create an employee record/i }),
		);

		await userEvent.type(
			screen.getByLabelText(/employee code/i),
			"EMP-99",
		);
		await userEvent.type(screen.getByLabelText(/first name/i), "Ada");
		await userEvent.type(screen.getByLabelText(/last name/i), "Lovelace");
		await userEvent.type(screen.getByLabelText(/hire date/i), "2026-06-01");
		await userEvent.selectOptions(
			screen.getByLabelText(/department/i),
			"d1",
		);
		await userEvent.selectOptions(
			screen.getByLabelText(/employment type/i),
			"contract",
		);

		await userEvent.click(screen.getByRole("button", { name: /create user/i }));

		await waitFor(() => expect(userApi.create).toHaveBeenCalled());
		const body = (userApi.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(body.employee).toMatchObject({
			employee_code: "EMP-99",
			first_name: "Ada",
			last_name: "Lovelace",
			email: "newhire@x.com",
			hire_date: "2026-06-01",
			department: "d1",
			employment_type: "contract",
		});
	});

	it("surfaces the backend error reason when create fails", async () => {
		const reason = "A user with email x already exists. Link instead.";
		(userApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error(reason),
		);
		renderPage();
		await waitFor(() => screen.getByLabelText(/company email/i));

		await userEvent.type(screen.getByLabelText(/company email/i), "newhire@x.com");
		await userEvent.selectOptions(
			screen.getByLabelText(/^role/i),
			"hr_manager",
		);
		await userEvent.click(screen.getByRole("button", { name: /create user/i }));

		expect(await screen.findByText(reason)).toBeInTheDocument();
	});

	it("renders no-permission state without user:create", async () => {
		canCreate = false;
		renderPage();
		expect(
			await screen.findByText(/don't have permission to create users/i),
		).toBeInTheDocument();
		expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument();
	});
});
