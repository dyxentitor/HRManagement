// biome-ignore lint/suspicious/noExplicitAny: test polyfill
(window.Element.prototype as any).hasPointerCapture = () => false;
// biome-ignore lint/suspicious/noExplicitAny: test polyfill
(window.Element.prototype as any).setPointerCapture = () => undefined;
// biome-ignore lint/suspicious/noExplicitAny: test polyfill
(window.Element.prototype as any).releasePointerCapture = () => undefined;

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FeedbackDetailPane } from "./FeedbackDetailPane";
import type { FeedbackItem, FeedbackNote, FeedbackActivity, AdminUser } from "../api";

const sampleItem: FeedbackItem = {
	id: "fb-test-1",
	category: "bug",
	title: "Payslip PDF fails to download on Safari",
	description: "When I click Download PDF, nothing happens in Safari 17.",
	affected_module: "payslips",
	status: "new",
	created_at: "2026-07-12T14:14:00Z",
	updated_at: "2026-07-12T14:14:00Z",
	reporter_email: "amelia.tasneem@provintell.com",
	reporter_name: "Amelia Tasneem",
	assignee_id: null,
	assignee_name: null,
	attachments: [
		{
			id: 1,
			filename: "safari-console.png",
			content_type: "image/png",
			size_bytes: 86_016,
			s3_key: "feedback/fb-test-1/safari-console.png",
			uploaded_at: "2026-07-12T14:15:00Z",
		},
	],
	notes: [],
};

const sampleNotes: FeedbackNote[] = [
	{
		id: 10,
		author_id: "admin-1",
		author_name: "HR Admin",
		body: "Reproduced on Safari 17.4 — presigned URL opens in a blocked popup.",
		created_at: "2026-07-12T15:00:00Z",
	},
];

const sampleActivity: FeedbackActivity[] = [
	{
		id: 1,
		action: "feedback.status.changed",
		actor: "HR Admin",
		before: { status: "new" },
		after: { status: "in_review" },
		ts: "2026-07-12T15:30:00Z",
	},
];

const admins: AdminUser[] = [
	{ id: "admin-1", email: "admin@example.com", role_codes: ["org_admin"] },
];

function renderPane(overrides?: Partial<Parameters<typeof FeedbackDetailPane>[0]>) {
	const onAddNote = vi.fn();
	const onStatusChange = vi.fn();
	const onAssigneeChange = vi.fn();
	const onDownload = vi.fn();
	const onNoteBodyChange = vi.fn();

	render(
		<FeedbackDetailPane
			item={sampleItem}
			admins={admins}
			notes={sampleNotes}
			activity={sampleActivity}
			noteBody=""
			onNoteBodyChange={onNoteBodyChange}
			onAddNote={onAddNote}
			onStatusChange={onStatusChange}
			onAssigneeChange={onAssigneeChange}
			onDownload={onDownload}
			busy={false}
			{...overrides}
		/>,
	);

	return { onAddNote, onStatusChange, onAssigneeChange, onDownload, onNoteBodyChange };
}

describe("FeedbackDetailPane", () => {
	it("renders the feedback title", () => {
		renderPane();
		expect(
			screen.getByRole("heading", { name: /payslip pdf fails to download on safari/i }),
		).toBeInTheDocument();
	});

	it("renders the description text", () => {
		renderPane();
		expect(
			screen.getByText(/when i click download pdf, nothing happens in safari 17/i),
		).toBeInTheDocument();
	});

	it("renders the note body", () => {
		renderPane();
		expect(
			screen.getByText(/reproduced on safari 17\.4/i),
		).toBeInTheDocument();
	});

	it("renders the attachment filename", () => {
		renderPane();
		expect(screen.getByText(/safari-console\.png/i)).toBeInTheDocument();
	});

	it("renders an activity line for status change", () => {
		renderPane();
		// activity entry: "HR Admin changed status → In Review"
		expect(screen.getByText(/changed status/i)).toBeInTheDocument();
	});

	it("renders the synthesized 'submitted this feedback' activity entry", () => {
		renderPane();
		expect(screen.getByText(/submitted this feedback/i)).toBeInTheDocument();
	});

	it("calls onAddNote when 'Add note' is clicked with text in textarea", async () => {
		const user = userEvent.setup();
		const onAddNote = vi.fn();
		const onNoteBodyChange = vi.fn();

		render(
			<FeedbackDetailPane
				item={sampleItem}
				admins={admins}
				notes={sampleNotes}
				activity={sampleActivity}
				noteBody="Test note content"
				onNoteBodyChange={onNoteBodyChange}
				onAddNote={onAddNote}
				onStatusChange={vi.fn()}
				onAssigneeChange={vi.fn()}
				onDownload={vi.fn()}
				busy={false}
			/>,
		);

		const addBtn = screen.getByRole("button", { name: /add note/i });
		await user.click(addBtn);
		expect(onAddNote).toHaveBeenCalledOnce();
	});

	it("'Add note' button is disabled when noteBody is empty", () => {
		renderPane({ noteBody: "" });
		const addBtn = screen.getByRole("button", { name: /add note/i });
		expect(addBtn).toBeDisabled();
	});

	it("'Add note' button is disabled when busy=true even with text", () => {
		renderPane({ noteBody: "some text", busy: true });
		const addBtn = screen.getByRole("button", { name: /add note/i });
		expect(addBtn).toBeDisabled();
	});

	it("calls onStatusChange when the status Select is changed", async () => {
		const user = userEvent.setup();
		const { onStatusChange } = renderPane();

		const statusTrigger = screen.getByRole("combobox", { name: /status/i });
		await user.click(statusTrigger);
		const inReviewOpt = await screen.findByRole("option", { name: /in review/i });
		await user.click(inReviewOpt);

		expect(onStatusChange).toHaveBeenCalledWith("in_review");
	});

	it("hides 'Mark Resolved' button when status is resolved", () => {
		renderPane({ item: { ...sampleItem, status: "resolved" } });
		expect(screen.queryByRole("button", { name: /mark resolved/i })).not.toBeInTheDocument();
	});

	it("hides 'Mark Resolved' button when status is closed", () => {
		renderPane({ item: { ...sampleItem, status: "closed" } });
		expect(screen.queryByRole("button", { name: /mark resolved/i })).not.toBeInTheDocument();
	});

	it("shows 'Mark Resolved' button when status is new", () => {
		renderPane({ item: { ...sampleItem, status: "new" } });
		expect(screen.getByRole("button", { name: /mark resolved/i })).toBeInTheDocument();
	});

	it("omits Attachments section when no attachments", () => {
		renderPane({ item: { ...sampleItem, attachments: [] } });
		expect(screen.queryByText(/attachments/i)).not.toBeInTheDocument();
	});

	it("calls onDownload with feedbackId and attachmentId when Download is clicked", async () => {
		const user = userEvent.setup();
		const { onDownload } = renderPane();

		const downloadBtn = screen.getByRole("button", { name: /download/i });
		await user.click(downloadBtn);

		expect(onDownload).toHaveBeenCalledOnce();
		expect(onDownload).toHaveBeenCalledWith("fb-test-1", 1);
	});
});
