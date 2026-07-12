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
	listActivity: vi.fn(),
	get: vi.fn(),
	remove: vi.fn(),
	listAuditLogs: vi.fn(),
}));

vi.mock("../api", () => ({
	feedbackApi: {
		listAll: mocks.listAll,
		updateStatus: mocks.updateStatus,
		assign: mocks.assign,
		listNotes: mocks.listNotes,
		addNote: mocks.addNote,
		listAdmins: mocks.listAdmins,
		listActivity: mocks.listActivity,
		get: mocks.get,
		remove: mocks.remove,
	},
}));

vi.mock("@/modules/admin/audit-api", () => ({
	listAuditLogs: mocks.listAuditLogs,
}));

const mockUseCan = vi.fn(() => true);
vi.mock("@/lib/perm", () => ({
	useCan: (...args: Parameters<typeof mockUseCan>) => mockUseCan(...args),
}));
vi.mock("@/lib/auth", () => ({
	useAuth: () => ({
		user: { id: "admin-1", email: "admin@example.com" },
		perms: new Set(["feedback:manage:org"]),
	}),
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
		reporter_name: "User One",
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
		reporter_name: "User Two",
		assignee_id: "admin-1",
		assignee_name: "Admin User",
		notes: [],
		attachments: [],
	},
	{
		id: "fb3",
		category: "bug" as const,
		title: "Resolved: export CSV fails",
		description: "CSV export was fixed last release.",
		affected_module: "reports",
		status: "resolved" as const,
		created_at: "2026-07-03T10:00:00Z",
		updated_at: "2026-07-03T11:00:00Z",
		reporter_email: "user3@example.com",
		reporter_name: "User Three",
		assignee_id: null,
		assignee_name: null,
		notes: [],
		attachments: [],
	},
];

const admins = [
	{ id: "admin-1", email: "admin@example.com", role_codes: ["org_admin"] },
	{ id: "admin-2", email: "admin2@example.com", role_codes: ["org_admin"] },
];

const sampleAuditRow = {
	id: 99,
	action: "feedback.status.changed",
	actor: "Admin User",
	before: { status: "new" },
	after: { status: "in_review" },
	ts: "2026-07-01T11:00:00Z",
};

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
	mocks.listActivity.mockResolvedValue([]);
	mocks.listAuditLogs.mockResolvedValue({ results: [], count: 0, page: 1, page_size: 50, entities: [] });
	mocks.updateStatus.mockResolvedValue({ ...adminFeedback[0], status: "in_review" });
	mocks.assign.mockResolvedValue({ ...adminFeedback[0], assignee_id: "admin-2", assignee_name: "Admin2" });
	mocks.addNote.mockResolvedValue({
		id: 2,
		body: "New note.",
		author_id: "admin-1",
		author_name: "Admin User",
		created_at: "2026-07-03T10:00:00Z",
	});
	mocks.remove.mockResolvedValue(undefined);
});

describe("FeedbackAdminPage", () => {
	it("renders one row per item showing title, status pill, and assignee", async () => {
		renderPage();
		// Both rows appear
		await waitFor(() => expect(screen.getByText("Login button broken")).toBeInTheDocument());
		expect(screen.getByText("Dark mode")).toBeInTheDocument();
		// Status pills rendered inside rows (getAllByText since chip "New" also exists)
		expect(screen.getAllByText("New").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("In Review").length).toBeGreaterThanOrEqual(1);
		// Assignee shown on row 2; rows 1 and 3 are unassigned
		expect(screen.getAllByText("Unassigned").length).toBeGreaterThanOrEqual(1);
		expect(mocks.listAll).toHaveBeenCalled();
	});

	it("shows empty-select state (no item selected) on initial render", async () => {
		renderPage();
		await waitFor(() => expect(screen.getByText("Login button broken")).toBeInTheDocument());
		expect(screen.getByText("Select a submission")).toBeInTheDocument();
	});

	it("clicking a row shows it in the pane (title + description) and fetches notes + activity", async () => {
		const user = userEvent.setup();
		mocks.listNotes.mockResolvedValue([
			{
				id: 1,
				body: "Being investigated.",
				author_id: "admin-1",
				author_name: "Admin User",
				created_at: "2026-07-02T11:00:00Z",
			},
		]);
		mocks.listActivity.mockResolvedValue([sampleAuditRow]);

		renderPage();
		await screen.findByText("Login button broken");

		await user.click(screen.getByText("Login button broken"));

		// Pane header shows the title
		await waitFor(() =>
			expect(screen.getByRole("heading", { name: /login button broken/i })).toBeInTheDocument(),
		);
		// Description appears in pane
		expect(screen.getByText("Cannot log in after password reset.")).toBeInTheDocument();
		// Notes fetched and shown
		await waitFor(() => expect(screen.getByText("Being investigated.")).toBeInTheDocument());
		// Activity fetched and shown
		expect(mocks.listActivity).toHaveBeenCalledWith("fb1");
		expect(mocks.listNotes).toHaveBeenCalledWith("fb1");
	});

	it("status chip filters call listAll with the right params", async () => {
		const user = userEvent.setup();
		mocks.listAll.mockResolvedValue([adminFeedback[0]]);
		renderPage();
		await screen.findByText("Login button broken");

		// Click the "New" status chip
		const newChip = screen.getByRole("button", { name: /^new$/i });
		await user.click(newChip);

		await waitFor(() =>
			expect(mocks.listAll).toHaveBeenCalledWith(
				expect.objectContaining({ status: "new" }),
			),
		);
	});

	it("category select filters call listAll with the right params", async () => {
		const user = userEvent.setup();
		mocks.listAll.mockResolvedValue([adminFeedback[0]]);
		renderPage();
		await screen.findByText("Login button broken");

		const categoryTrigger = screen.getByRole("combobox", { name: /filter by category/i });
		await user.click(categoryTrigger);
		const bugOpt = await screen.findByRole("option", { name: /^bug$/i });
		await user.click(bugOpt);

		await waitFor(() =>
			expect(mocks.listAll).toHaveBeenCalledWith(
				expect.objectContaining({ category: "bug" }),
			),
		);
	});

	it("status change in pane calls updateStatus", async () => {
		const user = userEvent.setup();
		renderPage();
		await screen.findByText("Login button broken");

		// Open detail for first item
		await user.click(screen.getByText("Login button broken"));
		await waitFor(() =>
			expect(screen.getByRole("heading", { name: /login button broken/i })).toBeInTheDocument(),
		);

		// Change status in the pane's Status select
		const statusSelect = screen.getByRole("combobox", { name: /status/i });
		await user.click(statusSelect);
		const inReviewOpt = await screen.findByRole("option", { name: /in review/i });
		await user.click(inReviewOpt);

		await waitFor(() =>
			expect(mocks.updateStatus).toHaveBeenCalledWith("fb1", "in_review"),
		);
	});

	it("assign in pane calls assign API", async () => {
		const user = userEvent.setup();
		renderPage();
		await screen.findByText("Login button broken");

		await user.click(screen.getByText("Login button broken"));
		await waitFor(() =>
			expect(screen.getByRole("heading", { name: /login button broken/i })).toBeInTheDocument(),
		);

		const assigneeSelect = screen.getByRole("combobox", { name: /assignee/i });
		await user.click(assigneeSelect);
		const admin2Opt = await screen.findByRole("option", { name: /admin2@example.com/i });
		await user.click(admin2Opt);

		await waitFor(() =>
			expect(mocks.assign).toHaveBeenCalledWith("fb1", "admin-2"),
		);
	});

	it("add note calls addNote API", async () => {
		const user = userEvent.setup();
		mocks.listNotes.mockResolvedValue([]);
		renderPage();
		await screen.findByText("Login button broken");

		await user.click(screen.getByText("Login button broken"));
		await waitFor(() =>
			expect(screen.getByRole("heading", { name: /login button broken/i })).toBeInTheDocument(),
		);

		const textarea = screen.getByPlaceholderText(/add an internal note/i);
		await user.type(textarea, "Investigating now.");

		const addBtn = screen.getByRole("button", { name: /add note/i });
		await user.click(addBtn);

		await waitFor(() =>
			expect(mocks.addNote).toHaveBeenCalledWith("fb1", "Investigating now."),
		);
	});

	it("Activity section shows synthesized 'submitted' entry + mocked audit row", async () => {
		const user = userEvent.setup();
		mocks.listActivity.mockResolvedValue([sampleAuditRow]);

		renderPage();
		await screen.findByText("Login button broken");
		await user.click(screen.getByText("Login button broken"));

		// Synthesized submitted entry
		await waitFor(() =>
			expect(screen.getByText(/submitted this feedback/i)).toBeInTheDocument(),
		);
		// Mocked audit row from listActivity
		expect(screen.getByText(/changed status/i)).toBeInTheDocument();
	});

	it("non-admin sees denied state and calls no listAll", async () => {
		mockUseCan.mockReturnValue(false);
		renderPage();
		await waitFor(() =>
			expect(
				screen.getByText(/you don't have permission to manage feedback/i),
			).toBeInTheDocument(),
		);
		expect(mocks.listAll).not.toHaveBeenCalled();
		expect(mocks.listAdmins).not.toHaveBeenCalled();
	});

	it("shows empty state in list when no items match filters", async () => {
		mocks.listAll.mockResolvedValue([]);
		renderPage();
		await waitFor(() =>
			expect(screen.getByText("No feedback")).toBeInTheDocument(),
		);
	});

	it("selecting resolved feedback → click Delete → confirm → removes item from list", async () => {
		const user = userEvent.setup();
		// After delete, listAll returns only the first two items
		mocks.listAll
			.mockResolvedValueOnce(adminFeedback) // initial load
			.mockResolvedValueOnce(adminFeedback.slice(0, 2)); // after delete refresh

		renderPage();
		await screen.findByText("Resolved: export CSV fails");

		// Select the resolved feedback row
		await user.click(screen.getByText("Resolved: export CSV fails"));
		await waitFor(() =>
			expect(
				screen.getByRole("heading", { name: /resolved: export csv fails/i }),
			).toBeInTheDocument(),
		);

		// Delete button is visible (status is "resolved")
		const deleteBtn = screen.getByRole("button", { name: /^delete$/i });
		await user.click(deleteBtn);

		// Confirm dialog appears
		const confirmBtn = await screen.findByRole("button", { name: /^delete$/i });
		await user.click(confirmBtn);

		// feedbackApi.remove called with the item's id
		await waitFor(() =>
			expect(mocks.remove).toHaveBeenCalledWith("fb3"),
		);

		// After refresh, resolved item is gone
		await waitFor(() =>
			expect(screen.queryByText("Resolved: export CSV fails")).not.toBeInTheDocument(),
		);
	});
});
