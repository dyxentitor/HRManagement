import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleApi, userRolesApi } from "../api";
import { RolesCard } from "./RolesCard";

vi.mock("../api", () => ({
	userRolesApi: { assign: vi.fn() },
	roleApi: { list: vi.fn() },
}));

vi.mock("@/lib/perm", () => ({
	useCan: () => true,
}));

beforeEach(() => {
	vi.clearAllMocks();
	(roleApi.list as ReturnType<typeof vi.fn>).mockResolvedValue([
		{ code: "manager", name: "Manager", is_system: true, member_count: 1 },
		{ code: "team_lead", name: "Team Lead", is_system: true, member_count: 0 },
		{ code: "employee", name: "Employee", is_system: true, member_count: 1 },
	]);
});

describe("RolesCard", () => {
	it("renders the user's current role badges", async () => {
		render(<RolesCard userId="u-1" currentRoles={["manager", "employee"]} />);
		expect(await screen.findByText("Manager")).toBeInTheDocument();
		expect(screen.getByText("Employee")).toBeInTheDocument();
	});

	it("opens edit dialog and assigns roles", async () => {
		(userRolesApi.assign as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			id: "u-1",
			roles: ["manager", "team_lead", "employee"],
		});

		render(<RolesCard userId="u-1" currentRoles={["manager", "employee"]} />);
		fireEvent.click(screen.getByRole("button", { name: /edit roles/i }));
		await waitFor(() => screen.getByText(/team lead/i));
		fireEvent.click(screen.getByRole("checkbox", { name: /team lead/i }));
		fireEvent.click(screen.getByRole("button", { name: /save/i }));
		await waitFor(() =>
			expect(userRolesApi.assign).toHaveBeenCalledWith(
				"u-1",
				expect.arrayContaining(["manager", "employee", "team_lead"]),
			),
		);
	});
});
