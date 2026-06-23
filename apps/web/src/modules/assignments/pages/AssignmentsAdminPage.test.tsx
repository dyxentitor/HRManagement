import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/perm", () => ({ useCan: (p: string) => p === "assignment:read:org" }));
vi.mock("@/modules/employee/api", () => ({ employeeApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), retrieve: vi.fn() }));
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
	api.create.mockResolvedValue({ id: "a2" });
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

	it("creates an assignment via the drawer", async () => {
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByText("Read SOP"));
		await user.click(screen.getByRole("button", { name: /new assignment/i }));
		await user.type(screen.getByLabelText(/^title/i), "Acknowledge handbook");
		await user.selectOptions(screen.getByLabelText(/^type/i), "acknowledge");
		// "Assign to" defaults to Everyone (org)
		await user.click(screen.getByRole("button", { name: /publish assignment/i }));
		await waitFor(() => expect(api.create).toHaveBeenCalled());
		expect(api.create.mock.calls[0][0]).toMatchObject({
			title: "Acknowledge handbook",
			type: "acknowledge",
			target: { kind: "org", ids: [] },
		});
	});
});
