import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ArchivedEmployeesPage from "./ArchivedEmployeesPage";
import { settingsApi } from "./settings-api";

vi.mock("./settings-api", () => ({
	settingsApi: {
		listArchivedEmployees: vi.fn(),
		restoreEmployee: vi.fn(),
	},
	unwrapResults: <T,>(b: T[] | { results: T[] }): T[] =>
		Array.isArray(b) ? b : b.results ?? [],
}));

beforeEach(() => {
	vi.clearAllMocks();
	(
		settingsApi.listArchivedEmployees as ReturnType<typeof vi.fn>
	).mockResolvedValue([
		{
			id: "e1",
			first_name: "Archived",
			last_name: "One",
			email: "a1@x.com",
			deleted_at: "2026-04-01T10:00:00Z",
		},
		{
			id: "e2",
			first_name: "Archived",
			last_name: "Two",
			email: "a2@x.com",
			deleted_at: "2026-03-15T10:00:00Z",
		},
	]);
});

describe("ArchivedEmployeesPage", () => {
	it("shows archived employees", async () => {
		render(<ArchivedEmployeesPage />);
		await waitFor(() => screen.getByText("Archived One"));
		expect(screen.getByText("Archived Two")).toBeInTheDocument();
	});

	it("removes a row after successful restore", async () => {
		(settingsApi.restoreEmployee as ReturnType<typeof vi.fn>).mockResolvedValue(
			undefined,
		);
		render(<ArchivedEmployeesPage />);
		await waitFor(() => screen.getByText("Archived One"));
		await userEvent.click(
			screen.getByRole("button", { name: /restore archived one/i }),
		);
		await waitFor(() =>
			expect(screen.queryByText("Archived One")).not.toBeInTheDocument(),
		);
		expect(settingsApi.restoreEmployee).toHaveBeenCalledWith("e1");
	});
});
