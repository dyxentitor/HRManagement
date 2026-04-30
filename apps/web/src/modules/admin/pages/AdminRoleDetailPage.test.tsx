import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleApi } from "../api";
import AdminRoleDetailPage from "./AdminRoleDetailPage";

vi.mock("../api", () => ({
	roleApi: {
		retrieve: vi.fn(),
		setPermissions: vi.fn(),
		reset: vi.fn(),
	},
}));

// Stub catalogue list — page fetches all known perms via roleApi indirectly,
// but here we just rely on the role's own permissions for grouping.

beforeEach(() => {
	vi.clearAllMocks();
});

const renderAt = (code: string) =>
	render(
		<MemoryRouter initialEntries={[`/admin/roles/${code}`]}>
			<Routes>
				<Route path="/admin/roles/:code" element={<AdminRoleDetailPage />} />
			</Routes>
		</MemoryRouter>,
	);

describe("AdminRoleDetailPage", () => {
	it("renders role name and permission rows grouped by module", async () => {
		(roleApi.retrieve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: "team_lead",
			name: "Team Lead",
			is_system: true,
			member_count: 2,
			permissions: ["leave:approve:team", "claim:approve:team"],
		});
		renderAt("team_lead");
		await waitFor(() => screen.getByText("Team Lead"));
		expect(screen.getByText("Leave")).toBeInTheDocument();
		expect(screen.getByText("Claims")).toBeInTheDocument();
	});

	it("toggles a permission and shows save bar", async () => {
		(roleApi.retrieve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: "team_lead",
			name: "Team Lead",
			is_system: true,
			member_count: 2,
			permissions: ["leave:approve:team"],
		});
		renderAt("team_lead");
		await waitFor(() => screen.getByText("Team Lead"));

		const checkbox = screen.getByRole("checkbox", {
			name: /leave:approve:team/,
		});
		expect(checkbox).toBeChecked();
		fireEvent.click(checkbox);

		expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
	});

	it("reset requires a second confirmation click", async () => {
		(roleApi.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
			code: "team_lead",
			name: "Team Lead",
			is_system: true,
			member_count: 2,
			permissions: [],
		});
		(roleApi.reset as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: "team_lead",
			name: "Team Lead",
			is_system: true,
			member_count: 2,
			permissions: ["leave:approve:team"],
		});
		renderAt("team_lead");
		await waitFor(() => screen.getByText("Team Lead"));

		const resetBtn = screen.getByRole("button", { name: /reset to defaults/i });
		fireEvent.click(resetBtn);
		expect(roleApi.reset).not.toHaveBeenCalled();

		const confirmBtn = screen.getByRole("button", {
			name: /click again to confirm/i,
		});
		fireEvent.click(confirmBtn);
		await waitFor(() =>
			expect(roleApi.reset).toHaveBeenCalledWith("team_lead"),
		);
	});
});
