import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ myAssignments: vi.fn(), complete: vi.fn() }));
vi.mock("../api", () => ({ assignmentsApi: api }));
vi.mock("@/modules/certification/api", () => ({
	certificationApi: { myAssignments: vi.fn().mockResolvedValue([]) },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ActionCenterPage from "./ActionCenterPage";

const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
	api.myAssignments.mockReset();
	api.complete.mockReset().mockResolvedValue({});
	api.myAssignments.mockResolvedValue([
		{
			id: "r1",
			assignment: {
				id: "a1",
				title: "Read Security Policy",
				type: "acknowledge",
				description: "",
				link_url: "",
				link_target: "none",
			},
			due_date: yesterday,
			status: "pending",
			effective_status: "overdue",
		},
		{
			id: "r2",
			assignment: {
				id: "a2",
				title: "Submit leave plan",
				type: "task",
				description: "",
				link_url: "/leave/me",
				link_target: "internal",
			},
			due_date: null,
			status: "pending",
			effective_status: "pending",
		},
	]);
});

function renderPage() {
	render(
		<MemoryRouter>
			<ActionCenterPage />
		</MemoryRouter>,
	);
}

describe("ActionCenterPage", () => {
	it("buckets assignments and renders titles", async () => {
		renderPage();
		await waitFor(() => expect(screen.getByText("Read Security Policy")).toBeInTheDocument());
		expect(screen.getByText("Overdue")).toBeInTheDocument();
		expect(screen.getByText("Upcoming")).toBeInTheDocument();
		expect(screen.getByText("Submit leave plan")).toBeInTheDocument();
	});

	it("acknowledging completes the item", async () => {
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByText("Read Security Policy"));
		await user.click(screen.getByRole("button", { name: /acknowledge/i }));
		await waitFor(() => expect(api.complete).toHaveBeenCalledWith("a1", ""));
	});
});
