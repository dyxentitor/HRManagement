import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const canList = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ roleApi: { list: canList } }));
const useCan = vi.hoisted(() => vi.fn());
vi.mock("@/lib/perm", () => ({ useCan }));

import { RolesCard } from "./RolesCard";

beforeEach(() => {
	canList.mockResolvedValue([
		{ code: "hr_manager", name: "HR Manager", is_system: true, member_count: 2 },
		{ code: "employee", name: "Employee", is_system: true, member_count: 9 },
	]);
	useCan.mockReturnValue(true);
});

describe("RolesCard (read-only)", () => {
	it("shows role names as links to the role's page; no edit dialog", async () => {
		render(
			<MemoryRouter>
				<RolesCard userId="u1" currentRoles={["hr_manager"]} />
			</MemoryRouter>,
		);
		await waitFor(() => expect(screen.getByText("HR Manager")).toBeInTheDocument());
		const link = screen.getByRole("link", { name: "HR Manager" });
		expect(link).toHaveAttribute("href", "/admin/settings/roles/hr_manager");
		// the old "Edit roles" dialog trigger is gone
		expect(screen.queryByRole("button", { name: /edit roles/i })).not.toBeInTheDocument();
	});

	it("renders plain chips (no links) without role:write", async () => {
		useCan.mockReturnValue(false);
		render(
			<MemoryRouter>
				<RolesCard userId="u1" currentRoles={["employee"]} />
			</MemoryRouter>,
		);
		await waitFor(() => expect(screen.getByText("Employee")).toBeInTheDocument());
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});
});
