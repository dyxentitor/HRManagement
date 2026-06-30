import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const list = vi.hoisted(() => vi.fn());
const approve = vi.hoisted(() => vi.fn());
const reject = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ incentiveApi: { claims: { list, approve, reject } } }));

import { ApprovalQueue } from "./ApprovalQueue";

const claim = {
	id: "c1",
	project: "p1",
	project_name: "Acme Pentest",
	employee_id: "e1",
	mandays: "5",
	note: "",
	status: "pending",
	reviewed_by: null,
	reviewed_at: null,
	reject_reason: "",
	billing_quarter: "",
	payout_status: "",
	created_at: new Date().toISOString(),
};

beforeEach(() => {
	list.mockReset();
	approve.mockReset().mockResolvedValue({});
	reject.mockReset();
});

describe("ApprovalQueue", () => {
	it("approving a pending claim calls the api and refetches", async () => {
		list.mockResolvedValueOnce([claim]).mockResolvedValueOnce([]); // before, then after
		const onReviewed = vi.fn();
		const user = userEvent.setup();
		render(<ApprovalQueue onReviewed={onReviewed} />);
		await waitFor(() => expect(screen.getByText(/Acme Pentest/)).toBeInTheDocument());
		await user.click(screen.getByRole("button", { name: /approve/i }));
		expect(approve).toHaveBeenCalledWith("c1");
		await waitFor(() => expect(onReviewed).toHaveBeenCalled());
	});

	it("shows an all-caught-up empty state", async () => {
		list.mockResolvedValue([]);
		render(<ApprovalQueue onReviewed={() => {}} />);
		await waitFor(() => expect(screen.getByText(/All caught up/)).toBeInTheDocument());
	});
});
