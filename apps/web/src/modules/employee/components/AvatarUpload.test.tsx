import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	uploadMyPhoto: vi.fn(),
	deleteMyPhoto: vi.fn(),
	uploadEmployeePhoto: vi.fn(),
	deleteEmployeePhoto: vi.fn(),
}));
vi.mock("../api", () => ({
	employeeApi: {
		uploadMyPhoto: mocks.uploadMyPhoto,
		deleteMyPhoto: mocks.deleteMyPhoto,
		uploadEmployeePhoto: mocks.uploadEmployeePhoto,
		deleteEmployeePhoto: mocks.deleteEmployeePhoto,
	},
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AvatarUpload } from "./AvatarUpload";

beforeEach(() => {
	for (const fn of Object.values(mocks)) fn.mockReset();
	mocks.uploadMyPhoto.mockResolvedValue(undefined);
	mocks.deleteMyPhoto.mockResolvedValue(undefined);
});

describe("AvatarUpload", () => {
	it("renders gradient placeholder when no photoUrl", () => {
		render(
			<AvatarUpload
				photoUrl={null}
				fullName="Alice Lim"
				onUploaded={() => {}}
				onDeleted={() => {}}
			/>,
		);
		expect(
			screen.queryByRole("img", { name: /avatar/i }),
		).not.toBeInTheDocument();
		expect(screen.getByLabelText(/change photo/i)).toBeInTheDocument();
	});

	it("renders <img> when photoUrl is set", () => {
		render(
			<AvatarUpload
				photoUrl="https://signed/photo.webp"
				fullName="Alice Lim"
				onUploaded={() => {}}
				onDeleted={() => {}}
			/>,
		);
		const img = screen.getByRole("img", { name: /alice lim avatar/i });
		expect(img).toHaveAttribute("src", "https://signed/photo.webp");
	});

	it("rejects oversize files with a toast", async () => {
		const { toast } = await import("sonner");
		const user = userEvent.setup();
		render(
			<AvatarUpload
				photoUrl={null}
				fullName="Alice"
				onUploaded={() => {}}
				onDeleted={() => {}}
			/>,
		);
		const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg", {
			type: "image/jpeg",
		});
		const input = screen.getByLabelText(/change photo/i) as HTMLInputElement;
		await user.upload(input, big);
		expect(mocks.uploadMyPhoto).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalled();
	});

	it("calls uploadMyPhoto with the picked file (self mode)", async () => {
		const user = userEvent.setup();
		const onUploaded = vi.fn();
		render(
			<AvatarUpload
				photoUrl={null}
				fullName="Alice"
				onUploaded={onUploaded}
				onDeleted={() => {}}
			/>,
		);
		const small = new File(["x"], "ok.jpg", { type: "image/jpeg" });
		const input = screen.getByLabelText(/change photo/i) as HTMLInputElement;
		await user.upload(input, small);
		expect(mocks.uploadMyPhoto).toHaveBeenCalledWith(small);
	});

	it("calls deleteMyPhoto when Remove photo is clicked", async () => {
		const user = userEvent.setup();
		const onDeleted = vi.fn();
		render(
			<AvatarUpload
				photoUrl="https://signed/photo.webp"
				fullName="Alice"
				onUploaded={() => {}}
				onDeleted={onDeleted}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /remove photo/i }));
		expect(mocks.deleteMyPhoto).toHaveBeenCalled();
	});
});
