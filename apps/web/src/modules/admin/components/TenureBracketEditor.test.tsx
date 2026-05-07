import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TenureBracketEditor } from "./TenureBracketEditor";

describe("TenureBracketEditor", () => {
	it("renders existing brackets as input rows", () => {
		render(
			<TenureBracketEditor
				value={[
					{ min_years: 0, days: 8 },
					{ min_years: 5, days: 16 },
				]}
				onChange={() => {}}
			/>,
		);
		// 2 rows × 2 numeric inputs each
		expect(screen.getAllByRole("spinbutton")).toHaveLength(4);
	});

	it("adds a new bracket row when + Add tier clicked", async () => {
		const onChange = vi.fn();
		render(<TenureBracketEditor value={[]} onChange={onChange} />);
		await userEvent.click(screen.getByRole("button", { name: /Add tier/i }));
		expect(onChange).toHaveBeenCalledWith([{ min_years: 0, days: 0 }]);
	});

	it("removes a bracket row when × clicked", async () => {
		const onChange = vi.fn();
		render(
			<TenureBracketEditor
				value={[{ min_years: 0, days: 8 }]}
				onChange={onChange}
			/>,
		);
		await userEvent.click(screen.getByRole("button", { name: /Remove tier/i }));
		expect(onChange).toHaveBeenCalledWith([]);
	});

	it("shows empty-state message when value is empty", () => {
		render(<TenureBracketEditor value={[]} onChange={() => {}} />);
		expect(screen.getByText(/No tenure tiers yet/)).toBeInTheDocument();
	});
});
