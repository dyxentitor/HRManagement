import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_CFG, EmployeeCodeSettings, previewCode } from "./EmployeeCodeSettings";

describe("EmployeeCodeSettings", () => {
	it("previewCode honours separator/year/width", () => {
		expect(previewCode({ ...DEFAULT_CFG })).toMatch(/^EMP-\d{4}-0001$/);
		expect(
			previewCode({ ...DEFAULT_CFG, separator: "", include_year: false, counter_width: 5 }),
		).toBe("EMP00001");
	});

	it("forces reset=never when year is turned off", async () => {
		const onChange = vi.fn();
		const user = userEvent.setup();
		render(<EmployeeCodeSettings value={DEFAULT_CFG} onChange={onChange} />);
		await user.click(screen.getByLabelText(/include year/i));
		expect(onChange).toHaveBeenCalledWith(
			expect.objectContaining({ include_year: false, reset: "never" }),
		);
	});

	it("emits separator changes", async () => {
		const onChange = vi.fn();
		const user = userEvent.setup();
		render(<EmployeeCodeSettings value={DEFAULT_CFG} onChange={onChange} />);
		await user.click(screen.getByRole("button", { name: "/" }));
		expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ separator: "/" }));
	});
});
