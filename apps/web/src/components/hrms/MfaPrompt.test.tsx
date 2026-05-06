import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MfaPrompt } from "./MfaPrompt";

describe("MfaPrompt", () => {
	it("renders the dialog and code input", () => {
		render(<MfaPrompt onCancel={() => {}} onSubmit={() => {}} />);
		expect(
			screen.getByRole("dialog", { name: /mfa required/i }),
		).toBeInTheDocument();
		expect(screen.getByLabelText(/mfa code/i)).toBeInTheDocument();
	});

	it("calls onSubmit with the typed code", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(<MfaPrompt onCancel={() => {}} onSubmit={onSubmit} />);
		await user.type(screen.getByLabelText(/mfa code/i), "123456");
		await user.click(screen.getByRole("button", { name: /submit/i }));
		expect(onSubmit).toHaveBeenCalledWith("123456");
	});

	it("calls onCancel when Cancel is clicked", async () => {
		const user = userEvent.setup();
		const onCancel = vi.fn();
		render(<MfaPrompt onCancel={onCancel} onSubmit={() => {}} />);
		await user.click(screen.getByRole("button", { name: /cancel/i }));
		expect(onCancel).toHaveBeenCalled();
	});
});
