import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EncryptedFieldInput } from "./EncryptedFieldInput";

describe("EncryptedFieldInput", () => {
	it("renders masked summary with last4 when provided", () => {
		render(
			<EncryptedFieldInput
				label="IC"
				last4="5475"
				onReplace={() => {}}
				canWrite={true}
			/>,
		);
		expect(screen.getByText(/IC ending in/i)).toBeInTheDocument();
		expect(screen.getByText(/5475/)).toBeInTheDocument();
	});

	it("renders generic 🔒 Encrypted when last4 is null", () => {
		render(
			<EncryptedFieldInput
				label="LHDN"
				last4={null}
				onReplace={() => {}}
				canWrite={true}
			/>,
		);
		expect(screen.getByText(/🔒 Encrypted/i)).toBeInTheDocument();
	});

	it("opens replace modal and calls onReplace with entered value", async () => {
		const user = userEvent.setup();
		const onReplace = vi.fn();
		render(
			<EncryptedFieldInput
				label="IC"
				last4="5475"
				onReplace={onReplace}
				canWrite={true}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /replace/i }));
		const input = await screen.findByLabelText(/new IC value/i);
		await user.type(input, "991231-14-5475");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(onReplace).toHaveBeenCalledWith("991231-14-5475");
	});
});
