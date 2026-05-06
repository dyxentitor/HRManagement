import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	archive: vi.fn(),
	empList: vi.fn(),
}));
vi.mock("../teams-api", () => ({
	teamApi: {
		list: mocks.list,
		create: mocks.create,
		update: mocks.update,
		archive: mocks.archive,
	},
}));
vi.mock("@/modules/employee/api", () => ({
	employeeApi: { list: mocks.empList },
}));

import AdminTeamsPage from "./AdminTeamsPage";

beforeEach(() => {
	for (const fn of [
		mocks.list,
		mocks.create,
		mocks.update,
		mocks.archive,
		mocks.empList,
	]) {
		fn.mockReset();
	}
	mocks.empList.mockResolvedValue([]);
});

function renderPage() {
	return render(
		<MemoryRouter>
			<AdminTeamsPage />
		</MemoryRouter>,
	);
}

describe("AdminTeamsPage", () => {
	it("renders the team list", async () => {
		mocks.list.mockResolvedValue([
			{ id: "t1", name: "Focus", sort_order: 1 },
			{ id: "t2", name: "Standby", sort_order: 2, min_headcount: 2 },
		]);
		renderPage();
		await waitFor(() => screen.getByText("Focus"));
		expect(screen.getByText("Standby")).toBeInTheDocument();
	});

	it("opens the create modal when New team is clicked", async () => {
		const user = userEvent.setup();
		mocks.list.mockResolvedValue([]);
		renderPage();
		await waitFor(() => screen.getByRole("button", { name: /new team/i }));
		await user.click(screen.getByRole("button", { name: /new team/i }));
		expect(
			screen.getByRole("heading", { name: /create team/i }),
		).toBeInTheDocument();
	});

	it("creates a team via the modal", async () => {
		const user = userEvent.setup();
		mocks.list.mockResolvedValue([]);
		mocks.create.mockResolvedValue({ id: "t-new", name: "New" });
		renderPage();
		await user.click(await screen.findByRole("button", { name: /new team/i }));
		await user.type(screen.getByLabelText(/^name$/i), "New");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith({
				name: "New",
				parent_team: null,
				sort_order: 0,
				min_headcount: null,
			}),
		);
	});

	it("opens edit modal pre-filled when Edit is clicked", async () => {
		const user = userEvent.setup();
		mocks.list.mockResolvedValue([{ id: "t1", name: "Focus", sort_order: 3 }]);
		renderPage();
		await user.click(
			await screen.findByRole("button", { name: /edit focus/i }),
		);
		expect(screen.getByLabelText(/^name$/i)).toHaveValue("Focus");
		expect(screen.getByLabelText(/sort order/i)).toHaveValue(3);
	});

	it("archives a team after confirmation", async () => {
		const user = userEvent.setup();
		mocks.list.mockResolvedValue([{ id: "t1", name: "Focus" }]);
		mocks.archive.mockResolvedValue(undefined);
		renderPage();
		await user.click(
			await screen.findByRole("button", { name: /archive focus/i }),
		);
		await user.click(screen.getByRole("button", { name: /confirm/i }));
		await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith("t1"));
	});
});
