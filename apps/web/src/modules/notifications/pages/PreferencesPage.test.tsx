import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "../api";
import PreferencesPage from "./PreferencesPage";

// Build a minimal preferences list that includes both a known security type
// and user.role_changed (the type under test).
const MOCK_PREFS: api.NotificationPreference[] = [
	{ id: 1, type: "auth.password_changed", channel: "in_app", enabled: true },
	{ id: 2, type: "auth.password_changed", channel: "email", enabled: true },
	{ id: 3, type: "user.role_changed", channel: "in_app", enabled: true },
	{ id: 4, type: "user.role_changed", channel: "email", enabled: true },
	{ id: 5, type: "leave.approved", channel: "in_app", enabled: true },
	{ id: 6, type: "leave.approved", channel: "email", enabled: false },
];

afterEach(() => vi.restoreAllMocks());

describe("PreferencesPage security rows", () => {
	it("auth.password_changed row shows (security) badge and its checkboxes are disabled", async () => {
		vi.spyOn(api, "getPreferences").mockResolvedValue(MOCK_PREFS);

		render(<PreferencesPage />);

		// Wait for the prefs to load
		await screen.findByText("Your role was updated");

		// Security badge must appear at least once
		expect(screen.getAllByText("(security)").length).toBeGreaterThanOrEqual(1);

		// Find the auth.password_changed row by locating the <td> that holds the
		// text, then walking up to the <tr> and querying its checkboxes.
		const labelCell = screen.getByText("Password changed");
		const row = labelCell.closest("tr")!;
		const checkboxes = within(row).getAllByRole("checkbox") as HTMLInputElement[];
		expect(checkboxes.length).toBeGreaterThanOrEqual(1);
		for (const cb of checkboxes) {
			expect(cb).toBeDisabled();
		}
	});

	it("user.role_changed row shows (security) badge and its checkboxes are disabled", async () => {
		vi.spyOn(api, "getPreferences").mockResolvedValue(MOCK_PREFS);

		render(<PreferencesPage />);

		// Wait for the prefs to load
		await screen.findByText("Your role was updated");

		// Find the user.role_changed row
		const labelCell = screen.getByText("Your role was updated");
		const row = labelCell.closest("tr")!;

		// The row must show the (security) badge
		expect(within(row).getByText("(security)")).toBeInTheDocument();

		// All checkboxes in the row must be disabled
		const checkboxes = within(row).getAllByRole("checkbox") as HTMLInputElement[];
		expect(checkboxes.length).toBeGreaterThanOrEqual(1);
		for (const cb of checkboxes) {
			expect(cb).toBeDisabled();
		}
	});

	it("leave.approved row checkboxes are NOT disabled (non-security type)", async () => {
		vi.spyOn(api, "getPreferences").mockResolvedValue(MOCK_PREFS);

		render(<PreferencesPage />);

		await screen.findByText("Leave request approved");

		const labelCell = screen.getByText("Leave request approved");
		const row = labelCell.closest("tr")!;

		// No security badge in this row
		expect(within(row).queryByText("(security)")).toBeNull();

		// Checkboxes must be enabled (togglable)
		const checkboxes = within(row).getAllByRole("checkbox") as HTMLInputElement[];
		for (const cb of checkboxes) {
			expect(cb).not.toBeDisabled();
		}
	});
});
