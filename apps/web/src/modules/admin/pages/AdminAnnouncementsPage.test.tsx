import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	remove: vi.fn(),
	can: vi.fn(),
}));

vi.mock("../announcements-api", () => ({
	announcementApi: {
		list: mocks.list,
		create: mocks.create,
		update: mocks.update,
		remove: mocks.remove,
	},
}));
vi.mock("@/lib/perm", () => ({ useCan: () => mocks.can() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AdminAnnouncementsPage from "./AdminAnnouncementsPage";

beforeEach(() => {
	for (const fn of [mocks.list, mocks.create, mocks.update, mocks.remove]) fn.mockReset();
	mocks.can.mockReturnValue(true);
});

function renderPage() {
	return render(
		<MemoryRouter>
			<AdminAnnouncementsPage />
		</MemoryRouter>,
	);
}

describe("AdminAnnouncementsPage", () => {
	it("lists announcements and marks the pinned one", async () => {
		mocks.list.mockResolvedValue([
			{
				id: "a1",
				title: "Leave policy 2026",
				body: "x",
				category: "policy",
				pinned: true,
				published_at: "2026-06-20T00:00:00Z",
				expires_at: null,
				created_at: "2026-06-20T00:00:00Z",
			},
		]);
		renderPage();
		await waitFor(() => screen.getByText("Leave policy 2026"));
		expect(screen.getByLabelText("Pinned")).toBeInTheDocument();
		expect(screen.getByText("policy")).toBeInTheDocument();
	});

	it("creates a new announcement", async () => {
		mocks.list.mockResolvedValue([]);
		mocks.create.mockResolvedValue({});
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByText(/No announcements yet/));

		await user.click(screen.getByRole("button", { name: /New announcement/ }));
		await user.type(screen.getByLabelText("Title"), "Town hall");
		await user.type(screen.getByLabelText("Body"), "Friday 4pm");
		await user.click(screen.getByRole("button", { name: /Publish/ }));

		await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
		expect(mocks.create.mock.calls[0][0]).toMatchObject({
			title: "Town hall",
			body: "Friday 4pm",
			category: "general",
			pinned: false,
		});
	});

	it("shows a permission notice without announcement:write", async () => {
		mocks.can.mockReturnValue(false);
		renderPage();
		expect(
			await screen.findByText(/don't have permission to manage announcements/),
		).toBeInTheDocument();
	});
});
