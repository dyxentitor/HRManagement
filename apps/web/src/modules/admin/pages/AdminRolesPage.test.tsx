import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleApi } from "../api";
import AdminRolesPage from "./AdminRolesPage";

vi.mock("../api", () => ({
	roleApi: { list: vi.fn() },
}));

beforeEach(() => {
	vi.clearAllMocks();
});

const renderPage = () =>
	render(
		<MemoryRouter>
			<AdminRolesPage />
		</MemoryRouter>,
	);

describe("AdminRolesPage", () => {
	it("renders the 7 roles", async () => {
		(roleApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
			{
				code: "org_admin",
				name: "Org Admin",
				is_system: true,
				member_count: 1,
			},
			{
				code: "hr_manager",
				name: "HR Manager",
				is_system: true,
				member_count: 1,
			},
			{ code: "finance", name: "Finance", is_system: true, member_count: 1 },
			{ code: "manager", name: "Manager", is_system: true, member_count: 3 },
			{
				code: "team_lead",
				name: "Team Lead",
				is_system: true,
				member_count: 2,
			},
			{ code: "employee", name: "Employee", is_system: true, member_count: 12 },
			{ code: "auditor", name: "Auditor", is_system: true, member_count: 0 },
		]);
		renderPage();
		await waitFor(() => {
			expect(screen.getByText("Org Admin")).toBeInTheDocument();
			expect(screen.getByText("Auditor")).toBeInTheDocument();
		});
	});

	it("shows member counts", async () => {
		(roleApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
			{ code: "manager", name: "Manager", is_system: true, member_count: 3 },
		]);
		renderPage();
		await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
	});
});
