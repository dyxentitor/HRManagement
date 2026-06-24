import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/perm", () => ({ useCan: (p: string) => p === "assignment:read:org" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const api = vi.hoisted(() => ({ list: vi.fn(), retrieve: vi.fn() }));
vi.mock("../api", () => ({ assignmentsApi: api }));

import AssignmentsAdminPage from "./AssignmentsAdminPage";

beforeEach(() => {
	for (const m of Object.values(api)) m.mockReset();
	api.list.mockResolvedValue([
		{
			id: "a1",
			title: "Read SOP",
			type: "acknowledge",
			status: "published",
			default_due_date: null,
		},
	]);
	api.retrieve.mockResolvedValue({
		id: "a1",
		title: "Read SOP",
		type: "acknowledge",
		version: 1,
		summary: { total: 2, done: 1, overdue: 0 },
		recipients: [
			{
				id: "r1",
				employee_name: "Ahmad Abdullah",
				employee_code: "E1",
				status: "completed",
				effective_status: "completed",
				completed_at: "2026-06-24",
				due_date: null,
			},
			{
				id: "r2",
				employee_name: "Siti Hassan",
				employee_code: "E2",
				status: "pending",
				effective_status: "pending",
				completed_at: null,
				due_date: null,
			},
		],
	});
});

function renderPage() {
	render(
		<MemoryRouter>
			<AssignmentsAdminPage />
		</MemoryRouter>,
	);
}

describe("AssignmentsAdminPage", () => {
	it("lists assignments", async () => {
		renderPage();
		await waitFor(() => expect(screen.getByText("Read SOP")).toBeInTheDocument());
	});

	it("links to the dedicated create page", async () => {
		renderPage();
		await waitFor(() => screen.getByText("Read SOP"));
		expect(screen.getByRole("link", { name: /new assignment/i })).toHaveAttribute(
			"href",
			"/admin/assignments/new",
		);
	});

	it("expands a row into the tracking panel with names + filters", async () => {
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByText("Read SOP"));
		await user.click(screen.getByRole("button", { name: /Read SOP/i }));
		await waitFor(() => expect(screen.getByText("Ahmad Abdullah")).toBeInTheDocument());
		// completion % and filter tabs render
		expect(screen.getByText("50%")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Overdue 0/i })).toBeInTheDocument();
		// filtering to Done hides the pending person
		await user.click(screen.getByRole("button", { name: /^Done 1/i }));
		expect(screen.queryByText("Siti Hassan")).not.toBeInTheDocument();
		expect(screen.getByText("Ahmad Abdullah")).toBeInTheDocument();
	});
});
