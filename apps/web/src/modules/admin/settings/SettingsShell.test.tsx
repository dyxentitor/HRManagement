import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsShell from "./SettingsShell";

vi.mock("./settings-api", () => ({
	settingsApi: {
		overview: vi.fn().mockResolvedValue({
			stats: {},
			attention: { unlinked_users_count: 0, unlinked_employees_count: 0 },
			recent_activity: [],
		}),
	},
}));

vi.mock("@/lib/perm", () => ({
	useCan: () => true,
}));

beforeEach(() => {
	vi.clearAllMocks();
});

function renderAt(path: string) {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route path="/admin/settings" element={<SettingsShell />}>
					<Route index element={<div>OVERVIEW</div>} />
					<Route path="organization" element={<div>ORG</div>} />
				</Route>
			</Routes>
		</MemoryRouter>,
	);
}

describe("SettingsShell", () => {
	it("renders the Settings heading", () => {
		renderAt("/admin/settings");
		expect(screen.getByText("Settings")).toBeInTheDocument();
	});

	it("renders the index child at /admin/settings", () => {
		renderAt("/admin/settings");
		expect(screen.getByText("OVERVIEW")).toBeInTheDocument();
	});

	it("renders the Organization child at /admin/settings/organization", () => {
		renderAt("/admin/settings/organization");
		expect(screen.getByText("ORG")).toBeInTheDocument();
	});

	it("renders nav items the user has permission for", async () => {
		renderAt("/admin/settings");
		await waitFor(() =>
			expect(screen.getByText("Overview")).toBeInTheDocument(),
		);
		expect(screen.getByText("Organization")).toBeInTheDocument();
		expect(screen.getByText("Departments")).toBeInTheDocument();
	});
});
