import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsOverviewPage from "./SettingsOverviewPage";
import { settingsApi } from "./settings-api";

vi.mock("./settings-api", () => ({
	settingsApi: { overview: vi.fn() },
}));

beforeEach(() => {
	vi.clearAllMocks();
});

function r() {
	return render(
		<MemoryRouter>
			<SettingsOverviewPage />
		</MemoryRouter>,
	);
}

describe("SettingsOverviewPage", () => {
	it("renders attention banner when unlinked users exist", async () => {
		(settingsApi.overview as ReturnType<typeof vi.fn>).mockResolvedValue({
			stats: {
				employees_active: 42,
				employees_archived: 3,
				departments: 6,
				modules_enabled: 8,
				modules_total: 12,
				roles: 6,
				perm_codes: 110,
			},
			attention: { unlinked_users_count: 3, unlinked_employees_count: 1 },
			recent_activity: [],
		});
		r();
		await waitFor(() =>
			expect(screen.getByText(/3 users not linked/i)).toBeInTheDocument(),
		);
	});

	it("renders stat tiles", async () => {
		(settingsApi.overview as ReturnType<typeof vi.fn>).mockResolvedValue({
			stats: {
				employees_active: 42,
				employees_archived: 3,
				departments: 6,
				modules_enabled: 8,
				modules_total: 12,
				roles: 6,
				perm_codes: 110,
			},
			attention: { unlinked_users_count: 0, unlinked_employees_count: 0 },
			recent_activity: [],
		});
		r();
		await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
		expect(screen.getByText("8/12")).toBeInTheDocument();
	});

	it("renders recent activity entries", async () => {
		(settingsApi.overview as ReturnType<typeof vi.fn>).mockResolvedValue({
			stats: {
				employees_active: 0,
				employees_archived: 0,
				departments: 0,
				modules_enabled: 0,
				modules_total: 0,
				roles: 0,
				perm_codes: 0,
			},
			attention: { unlinked_users_count: 0, unlinked_employees_count: 0 },
			recent_activity: [
				{
					action: "leave_type.created",
					summary: 'Leave type "Vacation" created',
					occurred_at: "2026-05-14T10:00:00Z",
				},
			],
		});
		r();
		await waitFor(() =>
			expect(
				screen.getByText(/Leave type "Vacation" created/),
			).toBeInTheDocument(),
		);
	});

	it("hides banner when no unlinked users", async () => {
		(settingsApi.overview as ReturnType<typeof vi.fn>).mockResolvedValue({
			stats: {
				employees_active: 0,
				employees_archived: 0,
				departments: 0,
				modules_enabled: 0,
				modules_total: 0,
				roles: 0,
				perm_codes: 0,
			},
			attention: { unlinked_users_count: 0, unlinked_employees_count: 0 },
			recent_activity: [],
		});
		r();
		await waitFor(() =>
			expect(screen.getByText("Overview")).toBeInTheDocument(),
		);
		expect(screen.queryByText(/not linked/)).toBeNull();
	});
});
