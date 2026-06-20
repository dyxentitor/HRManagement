import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ downloadAttachment: vi.fn() }));
vi.mock("../api", () => ({ claimsApi: { downloadAttachment: mocks.downloadAttachment } }));

import { ClaimReceipts } from "./ClaimReceipts";

beforeEach(() => mocks.downloadAttachment.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe("ClaimReceipts", () => {
	it("shows 'None attached' when there are no receipts", () => {
		render(<ClaimReceipts claimId="c1" attachments={[]} />);
		expect(screen.getByText(/none attached/i)).toBeInTheDocument();
	});

	it("opens a receipt via its presigned URL", async () => {
		const user = userEvent.setup();
		mocks.downloadAttachment.mockResolvedValue({ url: "https://minio/get", filename: "r.pdf" });
		const openSpy = vi.fn();
		vi.stubGlobal("open", openSpy);

		render(
			<ClaimReceipts claimId="c1" attachments={[{ id: 7, filename: "r.pdf", size_bytes: 1024 }]} />,
		);
		await user.click(screen.getByText("r.pdf"));

		await waitFor(() => expect(mocks.downloadAttachment).toHaveBeenCalledWith("c1", 7));
		expect(openSpy).toHaveBeenCalledWith("https://minio/get", "_blank", "noopener,noreferrer");
	});
});
