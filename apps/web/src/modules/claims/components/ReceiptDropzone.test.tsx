import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReceiptDropzone } from "./ReceiptDropzone";

function file(name: string, body = "x", lastModified = 1): File {
	return new File([body], name, { type: "application/pdf", lastModified });
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

	// --- prod incident 2026-08-06: two same-named receipts, one silently dropped ---

	it("keeps two DIFFERENT files that happen to share a filename", () => {
		const onChange = vi.fn();
		const existing = file("Receipt.pdf", "first");
		render(<ReceiptDropzone files={[existing]} onChange={onChange} />);
		// same name, different content/size — a genuinely different receipt
		const second = file("Receipt.pdf", "second-and-longer", 2);
		fireEvent.change(screen.getByLabelText("Receipts"), { target: { files: [second] } });

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange.mock.calls[0][0]).toHaveLength(2);
	});

	it("still skips a true re-pick of the identical file, and says so", () => {
		const onChange = vi.fn();
		const same = file("Receipt.pdf", "x", 7);
		render(<ReceiptDropzone files={[same]} onChange={onChange} />);
		fireEvent.change(screen.getByLabelText("Receipts"), {
			target: { files: [file("Receipt.pdf", "x", 7)] },
		});

		expect(onChange).not.toHaveBeenCalled();
		// the drop must be visible, not silent — that was the bug
		expect(screen.getByRole("status")).toHaveTextContent(/already attached/i);
	});

	it("removes only the intended file when two share a filename", () => {
		const onChange = vi.fn();
		const a = file("Receipt.pdf", "first", 1);
		const b = file("Receipt.pdf", "second", 2);
		render(<ReceiptDropzone files={[a, b]} onChange={onChange} />);

		// both chips render (name-keyed React keys would have collided here)
		expect(screen.getAllByRole("button", { name: "Remove Receipt.pdf" })).toHaveLength(2);
		fireEvent.click(screen.getAllByRole("button", { name: "Remove Receipt.pdf" })[0]);

		const remaining = onChange.mock.calls[0][0];
		expect(remaining).toHaveLength(1);
		expect(remaining[0]).toBe(b);
	});

	it("resets the input so the same file can be re-picked after removal", () => {
		const onChange = vi.fn();
		render(<ReceiptDropzone files={[]} onChange={onChange} />);
		const input = screen.getByLabelText("Receipts") as HTMLInputElement;
		fireEvent.change(input, { target: { files: [file("receipt.pdf")] } });
		expect(input.value).toBe("");
	});

	it("adds only the new files from a mixed selection", () => {
		const onChange = vi.fn();
		const existing = file("a.pdf", "a", 1);
		render(<ReceiptDropzone files={[existing]} onChange={onChange} />);
		fireEvent.change(screen.getByLabelText("Receipts"), {
			target: { files: [file("a.pdf", "a", 1), file("b.pdf", "b", 2)] },
		});

		const next = onChange.mock.calls[0][0];
		expect(next.map((f: File) => f.name)).toEqual(["a.pdf", "b.pdf"]);
		expect(screen.getByRole("status")).toHaveTextContent(/1 file was already attached/i);
	});
});
