import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApprovalActionBar } from "./ApprovalActionBar";

describe("ApprovalActionBar", () => {
	it("renders Approve and Reject buttons", () => {
		render(<ApprovalActionBar onApprove={() => {}} onReject={() => {}} />);
		expect(
			screen.getByRole("button", { name: /approve/i }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
	});

	it("calls onApprove with the comment when Approve is clicked", async () => {
		const user = userEvent.setup();
		const onApprove = vi.fn();
		render(<ApprovalActionBar onApprove={onApprove} onReject={() => {}} />);
		await user.type(screen.getByRole("textbox"), "Looks good");
		await user.click(screen.getByRole("button", { name: /approve/i }));
		expect(onApprove).toHaveBeenCalledWith("Looks good");
	});

	it("requires a comment for reject when requireRejectComment is true", async () => {
		const user = userEvent.setup();
		const onReject = vi.fn();
		render(
			<ApprovalActionBar
				onApprove={() => {}}
				onReject={onReject}
				requireRejectComment
			/>,
		);
		await user.click(screen.getByRole("button", { name: /reject/i }));
		expect(onReject).not.toHaveBeenCalled();
		expect(screen.getByText(/comment required/i)).toBeInTheDocument();
	});

	it("disables both buttons when busy", () => {
		render(<ApprovalActionBar onApprove={() => {}} onReject={() => {}} busy />);
		expect(screen.getByRole("button", { name: /approve/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /reject/i })).toBeDisabled();
	});
});
