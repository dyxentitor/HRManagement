import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReceiptDropzone } from "./ReceiptDropzone";

function file(name: string): File {
	return new File(["x"], name, { type: "application/pdf" });
}

describe("ReceiptDropzone", () => {
	it("adds browsed files via onChange", () => {
		const onChange = vi.fn();
		render(<ReceiptDropzone files={[]} onChange={onChange} />);
		const input = screen.getByLabelText("Receipts");
		fireEvent.change(input, { target: { files: [file("receipt.pdf")] } });
		expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: "receipt.pdf" })]);
	});

	it("renders a chip per file and removes one on click", () => {
		const onChange = vi.fn();
		render(<ReceiptDropzone files={[file("a.pdf"), file("b.pdf")]} onChange={onChange} />);
		expect(screen.getByText("a.pdf")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Remove a.pdf" }));
		expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: "b.pdf" })]);
	});
});
