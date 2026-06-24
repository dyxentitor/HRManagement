import { render, screen, waitFor } from "@testing-library/react";
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
		const link = screen.getByRole("link", { name: /new assignment/i });
		expect(link).toHaveAttribute("href", "/admin/assignments/new");
	});
});
