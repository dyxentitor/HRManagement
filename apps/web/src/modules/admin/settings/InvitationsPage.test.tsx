import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	resend: vi.fn(),
	revoke: vi.fn(),
	extend: vi.fn(),
	activity: vi.fn(),
	copyLink: vi.fn(),
}));
vi.mock("../invitations-api", () => ({ invitationsApi: mocks }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import InvitationsPage from "./InvitationsPage";

const rows = [
	{
		id: "i1",
		user_id: "u1",
		employee_id: null,
		email: "john@x.com",
		status: "opened",
		effective_status: "opened",
		expires_at: new Date(Date.now() + 40 * 3_600_000).toISOString(),
		sent_at: null,
		opened_at: null,
		activated_at: null,
		revoked_at: null,
		sent_count: 1,
		created_at: "",
		employee_name: "John Smith",
		department: "Engineering",
	},
	{
		id: "i2",
		user_id: "u2",
		employee_id: null,
		email: "rk@x.com",
		status: "activated",
		effective_status: "activated",
		expires_at: new Date().toISOString(),
		sent_at: null,
		opened_at: null,
		activated_at: new Date().toISOString(),
		revoked_at: null,
		sent_count: 1,
		created_at: "",
		employee_name: "Rajesh Kumar",
		department: "Engineering",
	},
];

beforeEach(() => {
	for (const m of Object.values(mocks)) m.mockReset();
	mocks.list.mockResolvedValue(rows);
});

function renderPage() {
	render(
		<MemoryRouter>
			<InvitationsPage />
		</MemoryRouter>,
	);
}

describe("InvitationsPage", () => {
	it("renders the funnel, rows, and status pills", async () => {
		renderPage();
		await waitFor(() => expect(screen.getByText("John Smith")).toBeInTheDocument());
		expect(screen.getByText("Rajesh Kumar")).toBeInTheDocument();
		// status pills
		expect(screen.getByText("Opened")).toBeInTheDocument();
		expect(screen.getByText("Activated")).toBeInTheDocument();
		// funnel hero shows 1 pending + 1 activated
		expect(screen.getByText(/1 awaiting activation/)).toBeInTheDocument();
	});

	it("offers an actions menu per row", async () => {
		renderPage();
		await waitFor(() => screen.getByText("John Smith"));
		expect(screen.getByRole("button", { name: /Actions for John Smith/i })).toBeInTheDocument();
	});
});
