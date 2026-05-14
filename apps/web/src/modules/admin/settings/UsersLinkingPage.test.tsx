import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UsersLinkingPage from "./UsersLinkingPage";
import { settingsApi } from "./settings-api";

vi.mock("./settings-api", () => ({
	settingsApi: {
		listUnlinkedUsers: vi.fn(),
		listUnlinkedEmployees: vi.fn(),
		linkUser: vi.fn(),
	},
	unwrapResults: <T,>(b: T[] | { results: T[] }): T[] =>
		Array.isArray(b) ? b : b.results ?? [],
}));

beforeEach(() => {
	vi.clearAllMocks();
	(settingsApi.listUnlinkedUsers as ReturnType<typeof vi.fn>).mockResolvedValue(
		[
			{
				id: "u1",
				email: "jane@x.com",
				role_codes: ["employee"],
				created_at: "2026-05-10",
				suggested_employee: {
					id: "e1",
					first_name: "Jane",
					last_name: "Tan",
					employee_code: "EMP-1",
					email: "jane@x.com",
				},
			},
		],
	);
	(
		settingsApi.listUnlinkedEmployees as ReturnType<typeof vi.fn>
	).mockResolvedValue([
		{
			id: "e1",
			first_name: "Jane",
			last_name: "Tan",
			employee_code: "EMP-1",
			email: "jane@x.com",
			department_name: null,
			suggested_user: { id: "u1", email: "jane@x.com" },
		},
	]);
});

describe("UsersLinkingPage", () => {
	it("renders both unlinked lists", async () => {
		render(<UsersLinkingPage />);
		await waitFor(() => screen.getByText("jane@x.com"));
		expect(screen.getByText("Jane Tan")).toBeInTheDocument();
	});

	it("pins suggested option to top of dropdown", async () => {
		render(<UsersLinkingPage />);
		await waitFor(() => screen.getByText("jane@x.com"));
		const userRow = screen
			.getByText("jane@x.com")
			.closest('[data-row="unlinked-user"]');
		expect(userRow).toBeTruthy();
		const linkBtn = within(userRow as HTMLElement).getByRole("button", {
			name: /link/i,
		});
		await userEvent.click(linkBtn);
		const options = await screen.findAllByTestId("link-option");
		expect(options[0]).toHaveTextContent(/Jane Tan/);
		expect(options[0]).toHaveTextContent(/suggested/i);
	});

	it("calls linkUser on selection", async () => {
		(settingsApi.linkUser as ReturnType<typeof vi.fn>).mockResolvedValue({});
		render(<UsersLinkingPage />);
		await waitFor(() => screen.getByText("jane@x.com"));
		const userRow = screen
			.getByText("jane@x.com")
			.closest('[data-row="unlinked-user"]');
		await userEvent.click(
			within(userRow as HTMLElement).getByRole("button", { name: /link/i }),
		);
		const options = await screen.findAllByTestId("link-option");
		await userEvent.click(options[0]);
		await waitFor(() =>
			expect(settingsApi.linkUser).toHaveBeenCalledWith("e1", "u1"),
		);
	});
});
