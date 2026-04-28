import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DetailPanel } from "./DetailPanel";

describe("DetailPanel", () => {
	it("does not render when closed", () => {
		render(
			<DetailPanel open={false} onClose={() => {}} title="Leave LR-1">
				body
			</DetailPanel>,
		);
		expect(screen.queryByText("Leave LR-1")).not.toBeInTheDocument();
	});

	it("renders title, body, and close button when open", () => {
		render(
			<DetailPanel open={true} onClose={() => {}} title="Leave LR-1">
				<p>annual leave details</p>
			</DetailPanel>,
		);
		expect(
			screen.getByRole("dialog", { name: "Leave LR-1" }),
		).toBeInTheDocument();
		expect(screen.getByText("annual leave details")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /close detail panel/i }),
		).toBeInTheDocument();
	});

	it("calls onClose when close button is clicked", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(
			<DetailPanel open={true} onClose={onClose} title="Leave LR-1">
				body
			</DetailPanel>,
		);
		await user.click(
			screen.getByRole("button", { name: /close detail panel/i }),
		);
		expect(onClose).toHaveBeenCalled();
	});

	it("calls onClose when Esc is pressed", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(
			<DetailPanel open={true} onClose={onClose} title="Leave LR-1">
				body
			</DetailPanel>,
		);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalled();
	});

	it("renders footer slot", () => {
		render(
			<DetailPanel
				open={true}
				onClose={() => {}}
				title="Leave LR-1"
				footer={<button type="button">Approve</button>}
			>
				body
			</DetailPanel>,
		);
		expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
	});
});
