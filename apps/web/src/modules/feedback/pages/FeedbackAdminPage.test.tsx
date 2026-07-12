import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Radix-UI pointer capture polyfill
// biome-ignore lint/suspicious/noExplicitAny: test polyfill
(window.Element.prototype as any).hasPointerCapture = () => false;
// biome-ignore lint/suspicious/noExplicitAny: test polyfill
(window.Element.prototype as any).setPointerCapture = () => undefined;
// biome-ignore lint/suspicious/noExplicitAny: test polyfill
(window.Element.prototype as any).releasePointerCapture = () => undefined;

const mocks = vi.hoisted(() => ({
	listAll: vi.fn(),
	updateStatus: vi.fn(),
	assign: vi.fn(),
	listNotes: vi.fn(),
	addNote: vi.fn(),
	listAdmins: vi.fn(),
	get: vi.fn(),
}));

vi.mock("../api", () => ({
	feedbackApi: {
		listAll: mocks.listAll,
		updateStatus: mocks.updateStatus,
		assign: mocks.assign,
		listNotes: mocks.listNotes,
		addNote: mocks.addNote,
		listAdmins: mocks.listAdmins,
		get: mocks.get,
	},
}));

const mockUseCan = vi.fn(() => true);
vi.mock("@/lib/perm", () => ({ useCan: (...args: Parameters<typeof mockUseCan>) => mockUseCan(...args) }));
vi.mock("@/lib/auth", () => ({
	useAuth: () => ({ user: { id: "admin-1", email: "admin@example.com" }, perms: new Set(["feedback:manage:org"]) }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import FeedbackAdminPage from "./FeedbackAdminPage";

const adminFeedback = [
	{
		id: "fb1",
		category: "bug" as const,
		title: "Login button broken",
		description: "Cannot log in after password reset.",
		affected_module: "auth",
		status: "new" as const,
		created_at: "2026-07-01T10:00:00Z",
		updated_at: "2026-07-01T10:00:00Z",
		reporter_email: "user1@example.com",
		assignee_id: null,
		assignee_name: null,
		notes: [],
		attachments: [],
	},
	{
		id: "fb2",
		category: "feature" as const,
		title: "Dark mode",
		description: "Add dark mode support.",
		affected_module: null,
		status: "in_review" as const,
		created_at: "2026-07-02T10:00:00Z",
		updated_at: "2026-07-02T10:00:00Z",
		reporter_email: "user2@example.com",
		assignee_id: "admin-1",
		assignee_name: "Admin User",
		notes: [{ id: 1, body: "Being investigated.", author_id: "admin-1", author_name: "Admin User", created_at: "2026-07-02T11:00:00Z" }],
		attachments: [],
	},
];

const admins = [
	{ id: "admin-1", email: "admin@example.com", role_codes: ["org_admin"] },
	{ id: "admin-2", email: "admin2@example.com", role_codes: ["org_admin"] },
];

function renderPage() {
	return render(
		<MemoryRouter>
			<FeedbackAdminPage />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mockUseCan.mockReturnValue(true);
	mocks.listAll.mockResolvedValue(adminFeedback);
	mocks.listAdmins.mockResolvedValue(admins);
	mocks.listNotes.mockResolvedValue([]);
	mocks.updateStatus.mockResolvedValue({ ...adminFeedback[0], status: "in_review" });
	mocks.assign.mockResolvedValue({ ...adminFeedback[0], assignee_id: "admin-2" });
	mocks.addNote.mockResolvedValue({ id: 2, body: "New note.", author_id: "admin-1", author_name: "Admin User", created_at: "2026-07-03T10:00:00Z" });
});

describe("FeedbackAdminPage", () => {
	it("renders a table of all org feedback from ?scope=org", async () => {
		renderPage();
		await waitFor(() => expect(screen.getByText("Login button broken")).toBeInTheDocument());
		expect(screen.getByText("Dark mode")).toBeInTheDocument();
		expect(screen.getByText("user1@example.com")).toBeInTheDocument();
		expect(mocks.listAll).toHaveBeenCalled();
	});

	it("filters by status when the status Select is changed", async () => {
		const user = userEvent.setup();
		mocks.listAll.mockResolvedValue([adminFeedback[0]]);
		renderPage();
		await screen.findByText("Login button broken");

		// Find and interact with the status filter
		const statusTrigger = screen.getByRole("combobox", { name: /filter by status/i });
		await user.click(statusTrigger);
		// "New" appears as a filter option (not "All statuses")
		const newOpt = await screen.findByRole("option", { name: /^new$/i });
		await user.click(newOpt);

		await waitFor(() =>
			expect(mocks.listAll).toHaveBeenCalledWith(expect.objectContaining({ status: "new" })),
		);
	});

	it("opens detail panel when a row is clicked, showing status and notes", async () => {
		const user = userEvent.setup();
		mocks.listNotes.mockResolvedValue([
			{ id: 1, body: "Being investigated.", author_id: "admin-1", author_name: "Admin User", created_at: "2026-07-02T11:00:00Z" },
		]);
		renderPage();
		await screen.findByText("Dark mode");

		await user.click(screen.getByText("Dark mode"));

		// Detail panel should appear with a status select
		await waitFor(() =>
			expect(screen.getByRole("combobox", { name: /status/i })).toBeInTheDocument(),
		);
		// Note should be visible (loaded from listNotes)
		await waitFor(() =>
			expect(screen.getByText("Being investigated.")).toBeInTheDocument(),
		);
	});

	it("calls updateStatus (PATCH) when status is changed in the detail panel", async () => {
		const user = userEvent.setup();
		renderPage();
		await screen.findByText("Login button broken");

		// Click the first row
		await user.click(screen.getByText("Login button broken"));

		// Wait for detail panel with status select
		const statusSelect = await screen.findByRole("combobox", { name: /status/i });
		await user.click(statusSelect);
		const inReviewOpt = await screen.findByRole("option", { name: /in review/i });
		await user.click(inReviewOpt);

		await waitFor(() =>
			expect(mocks.updateStatus).toHaveBeenCalledWith("fb1", "in_review"),
		);
	});

	it("calls addNote (POST notes endpoint) when add note button is clicked", async () => {
		const user = userEvent.setup();
		mocks.listNotes.mockResolvedValue([]);
		renderPage();
		await screen.findByText("Login button broken");

		await user.click(screen.getByText("Login button broken"));

		// Wait for detail panel
		await screen.findByRole("combobox", { name: /status/i });

		// Type a note
		const textarea = screen.getByPlaceholderText(/add an internal note/i);
		await user.type(textarea, "Investigating now.");

		const addBtn = screen.getByRole("button", { name: /add note/i });
		await user.click(addBtn);

		await waitFor(() =>
			expect(mocks.addNote).toHaveBeenCalledWith("fb1", "Investigating now."),
		);
	});

	it("non_admin_sees_denied_and_no_fetch — denied state shown and no network calls fired", async () => {
		mockUseCan.mockReturnValue(false);
		renderPage();
		// Denied state renders immediately — no waitFor needed, but use it for robustness
		await waitFor(() =>
			expect(
				screen.getByText(/you don't have permission to manage feedback/i),
			).toBeInTheDocument(),
		);
		expect(mocks.listAll).not.toHaveBeenCalled();
		expect(mocks.listAdmins).not.toHaveBeenCalled();
	});
});
