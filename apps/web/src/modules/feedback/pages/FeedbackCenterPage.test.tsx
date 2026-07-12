import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listMine: vi.fn(),
	create: vi.fn(),
	presignedUpload: vi.fn(),
	registerAttachment: vi.fn(),
	downloadAttachment: vi.fn(),
}));

vi.mock("../api", () => ({
	feedbackApi: {
		listMine: mocks.listMine,
		create: mocks.create,
		presignedUpload: mocks.presignedUpload,
		registerAttachment: mocks.registerAttachment,
		downloadAttachment: mocks.downloadAttachment,
	},
}));

import FeedbackCenterPage from "./FeedbackCenterPage";

const feedbackItems = [
	{
		id: "fb1",
		category: "bug" as const,
		title: "Button does not work",
		description: "The submit button on claims is broken.",
		affected_module: "claims",
		status: "new" as const,
		created_at: "2026-07-01T10:00:00Z",
		updated_at: "2026-07-01T10:00:00Z",
		attachments: [],
	},
	{
		id: "fb2",
		category: "feature" as const,
		title: "Dark mode support",
		description: "Please add dark mode.",
		affected_module: null,
		status: "in_review" as const,
		created_at: "2026-07-02T10:00:00Z",
		updated_at: "2026-07-02T10:00:00Z",
		attachments: [],
	},
];

function renderPage() {
	render(
		<MemoryRouter>
			<FeedbackCenterPage />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	mocks.listMine.mockReset();
	mocks.create.mockReset();
	mocks.presignedUpload.mockReset();
	mocks.registerAttachment.mockReset();
	mocks.downloadAttachment.mockReset();
	mocks.listMine.mockResolvedValue([]);
});

describe("FeedbackCenterPage", () => {
	it("renders the submit form with category, title and description fields", async () => {
		renderPage();
		// PageHeader renders an <h1> with the page title
		expect(await screen.findByRole("heading", { name: /^feedback$/i, level: 1 })).toBeInTheDocument();
		// form fields
		expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
		// submit button disabled when empty
		expect(screen.getByRole("button", { name: /submit feedback/i })).toBeDisabled();
	});

	it("submits {category, title, description} to POST /api/v1/feedback/", async () => {
		const user = userEvent.setup();
		mocks.create.mockResolvedValue({ id: "fb-new", status: "new" });
		mocks.listMine.mockResolvedValue([]);

		// Radix-UI Select requires hasPointerCapture on the trigger element.
		// Stub it globally so pointer events dispatch correctly in happy-dom.
		// biome-ignore lint/suspicious/noExplicitAny: test polyfill
		(window.Element.prototype as any).hasPointerCapture = () => false;
		// biome-ignore lint/suspicious/noExplicitAny: test polyfill
		(window.Element.prototype as any).setPointerCapture = () => undefined;
		// biome-ignore lint/suspicious/noExplicitAny: test polyfill
		(window.Element.prototype as any).releasePointerCapture = () => undefined;

		renderPage();

		await screen.findByRole("heading", { name: /^feedback$/i, level: 1 });

		// Select category via combobox (shadcn Select)
		const trigger = screen.getByRole("combobox", { name: /^category$/i });
		await user.click(trigger);
		const bugOption = await screen.findByRole("option", { name: /^bug$/i });
		await user.click(bugOption);

		// Fill title
		await user.type(screen.getByLabelText(/title/i), "Login is broken");

		// Fill description
		await user.type(screen.getByLabelText(/description/i), "Cannot log in after password reset.");

		// Submit
		const submitBtn = screen.getByRole("button", { name: /submit feedback/i });
		await user.click(submitBtn);

		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					category: "bug",
					title: "Login is broken",
					description: "Cannot log in after password reset.",
				}),
			),
		);
	});

	it("renders My Feedback list with StatusPill for each item", async () => {
		mocks.listMine.mockResolvedValue(feedbackItems);
		renderPage();

		// Items show in the list
		expect(await screen.findByText("Button does not work")).toBeInTheDocument();
		expect(screen.getByText("Dark mode support")).toBeInTheDocument();

		// StatusPill labels
		expect(screen.getByText("New")).toBeInTheDocument();
		expect(screen.getByText("In Review")).toBeInTheDocument();
	});

	it("shows an empty state when there are no feedback items", async () => {
		mocks.listMine.mockResolvedValue([]);
		renderPage();
		expect(await screen.findByText(/no feedback yet/i)).toBeInTheDocument();
	});
});
