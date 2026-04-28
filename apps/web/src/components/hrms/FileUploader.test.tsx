import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FileUploader } from "./FileUploader";

describe("FileUploader", () => {
	it("renders drop zone with helper text", () => {
		render(
			<FileUploader
				accept="application/pdf"
				maxSize={5_000_000}
				getPresignedUpload={async () => ({ url: "x", fields: {}, key: "y" })}
				onUploaded={() => {}}
			/>,
		);
		expect(screen.getByText(/Drop a file here/i)).toBeInTheDocument();
	});

	it("rejects oversize files", async () => {
		const user = userEvent.setup();
		render(
			<FileUploader
				accept="application/pdf"
				maxSize={1000}
				getPresignedUpload={async () => ({ url: "x", fields: {}, key: "y" })}
				onUploaded={() => {}}
			/>,
		);
		const input = screen.getByLabelText(/upload/i) as HTMLInputElement;
		const big = new File(["x".repeat(2000)], "big.pdf", {
			type: "application/pdf",
		});
		await user.upload(input, big);
		expect(screen.getByText(/File is too large/i)).toBeInTheDocument();
	});
});
