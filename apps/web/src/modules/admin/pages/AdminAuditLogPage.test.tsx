import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	csv: vi.fn(),
	can: vi.fn(),
}));

vi.mock("../audit-api", () => ({
	listAuditLogs: mocks.list,
	downloadAuditCsv: mocks.csv,
}));
vi.mock("@/lib/perm", () => ({ useCan: () => mocks.can() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AdminAuditLogPage from "./AdminAuditLogPage";

beforeEach(() => {
	mocks.list.mockReset();
	mocks.can.mockReturnValue(true);
});

function renderPage() {
	return render(
		<MemoryRouter>
			<AdminAuditLogPage />
		</MemoryRouter>,
	);
}

const PAGE = {
	results: [
		{
			id: 2,
			ts: "2026-06-20T09:04:00Z",
			actor_id: "u1",
			actor: "Siti Yusof",
			action: "salary.update",
			entity: "employee",
			entity_id: "e1",
			before: { salary: "•••••", title: "Exec" },
			after: { salary: "•••••", title: "Manager" },
			ip: "10.0.0.2",
		},
	],
	count: 1,
	page: 1,
	page_size: 50,
	entities: ["employee", "leave_request"],
};

describe("AdminAuditLogPage", () => {
	it("lists audit events", async () => {
		mocks.list.mockResolvedValue(PAGE);
		renderPage();
		await waitFor(() => screen.getByText("Siti Yusof"));
		expect(screen.getByText("salary update")).toBeInTheDocument();
		expect(screen.getByText("employee")).toBeInTheDocument();
	});

	it("opens a before/after detail with changed fields highlighted", async () => {
		mocks.list.mockResolvedValue(PAGE);
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByText("Siti Yusof"));
		await user.click(screen.getByText("Siti Yusof"));
		// dialog shows the diff table
		expect(await screen.findByText("Before")).toBeInTheDocument();
		expect(screen.getByText("Exec")).toBeInTheDocument();
		expect(screen.getByText("Manager")).toBeInTheDocument();
	});

	it("shows a permission notice without audit:read:org", async () => {
		mocks.can.mockReturnValue(false);
		renderPage();
		expect(
			await screen.findByText(/don't have permission to view the audit log/),
		).toBeInTheDocument();
	});
});
