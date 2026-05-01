import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CellPopover } from "./CellPopover";

const shifts = [
	{ id: "s1", code: "M", name: "Morning" },
	{ id: "s2", code: "N", name: "Night" },
];

describe("CellPopover", () => {
	it("renders empty-cell variant with shift selector", () => {
		render(
			<CellPopover
				open
				assignment={null}
				shifts={shifts}
				onSave={vi.fn()}
				onDelete={vi.fn()}
				onCoverUp={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByLabelText("Shift")).toBeInTheDocument();
		expect(screen.queryByText("Delete")).not.toBeInTheDocument();
	});

	it("renders filled-cell variant with delete + cover-up", () => {
		render(
			<CellPopover
				open
				assignment={{
					id: "a1",
					shift_id: "s1",
					shift_code: "M",
					covering_for_id: null,
					covering_for_name: null,
					notes: "",
				}}
				shifts={shifts}
				onSave={vi.fn()}
				onDelete={vi.fn()}
				onCoverUp={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByText("Delete")).toBeInTheDocument();
		expect(screen.getByText(/Mark cover-up/)).toBeInTheDocument();
	});

	it("calls onSave with selected shift", async () => {
		const onSave = vi.fn();
		render(
			<CellPopover
				open
				assignment={null}
				shifts={shifts}
				onSave={onSave}
				onDelete={vi.fn()}
				onCoverUp={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		await userEvent.selectOptions(screen.getByLabelText("Shift"), "s2");
		await userEvent.click(screen.getByText("Save"));
		expect(onSave).toHaveBeenCalledWith({ shift_id: "s2", notes: "" });
	});
});
