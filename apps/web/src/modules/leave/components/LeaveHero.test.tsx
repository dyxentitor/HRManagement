import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { LeaveBalance } from "../api";
import { LeaveHero } from "./LeaveHero";

const balances = [
	{
		id: "1",
		leave_type: "a",
		leave_type_code: "ANNUAL",
		leave_type_name: "Annual",
		year: 2026,
		entitled: "16",
		accrued: "16",
		taken: "5",
		pending: "0",
		carried_forward: "2",
		available: "11",
	},
	{
		id: "2",
		leave_type: "b",
		leave_type_code: "SICK",
		leave_type_name: "Sick",
		year: 2026,
		entitled: "14",
		accrued: "14",
		taken: "0",
		pending: "0",
		carried_forward: "0",
		available: "14",
	},
] as unknown as LeaveBalance[];

function renderHero(onSelect = vi.fn()) {
	render(
		<MemoryRouter>
			<LeaveHero balances={balances} primaryCode="ANNUAL" onSelectType={onSelect} />
		</MemoryRouter>,
	);
	return onSelect;
}

describe("LeaveHero", () => {
	it("shows the primary type, its available count, and an Apply link", () => {
		renderHero();
		expect(screen.getByText("Annual leave")).toBeInTheDocument();
		expect(screen.getByText("11")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Apply/ })).toHaveAttribute(
			"href",
			"/leave/apply",
		);
	});

	it("renders a chip per other type and fires onSelectType", async () => {
		const onSelect = renderHero();
		const chip = screen.getByRole("button", { name: /SICK/ });
		await userEvent.click(chip);
		expect(onSelect).toHaveBeenCalledWith("SICK");
	});
});
