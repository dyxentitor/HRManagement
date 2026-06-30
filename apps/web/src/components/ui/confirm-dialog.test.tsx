import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
	it("fires onConfirm when the confirm button is clicked", async () => {
		const onConfirm = vi.fn();
		const user = userEvent.setup();
		render(
			<ConfirmDialog
				open
				onOpenChange={() => {}}
				title="Delete role?"
				description="This can't be undone."
				confirmLabel="Delete"
				variant="danger"
				onConfirm={onConfirm}
			/>,
		);
		expect(screen.getByText("Delete role?")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Delete" }));
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("does not fire onConfirm when cancelled", async () => {
		const onConfirm = vi.fn();
		const user = userEvent.setup();
		render(<ConfirmDialog open onOpenChange={() => {}} title="Reset?" onConfirm={onConfirm} />);
		await user.click(screen.getByRole("button", { name: /cancel/i }));
		expect(onConfirm).not.toHaveBeenCalled();
	});
});
