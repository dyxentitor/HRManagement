import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CalendarStats } from "../api";
import { StatsFooter } from "./StatsFooter";

const stats: CalendarStats = {
	by_day: [
		{ date: "2026-03-04", hours: 24, headcount: 8 },
		{ date: "2026-03-05", hours: 16, headcount: 4 },
	],
	totals: { hours: 312, headcount: 14 },
	coverage: [
		{
			team_id: "t1",
			team_name: "L1",
			by_day: [
				{ date: "2026-03-04", scheduled: 2, min: 2, ok: true },
				{ date: "2026-03-05", scheduled: 1, min: 2, ok: false },
			],
		},
	],
};

describe("StatsFooter", () => {
	it("shows totals", () => {
		render(<StatsFooter stats={stats} />);
		expect(screen.getByText(/Hours: 312/)).toBeInTheDocument();
		expect(screen.getByText(/Headcount: 14/)).toBeInTheDocument();
	});

	it("renders coverage row with coral when under min", () => {
		render(<StatsFooter stats={stats} />);
		const failingCell = screen.getByLabelText("L1 coverage on 2026-03-05");
		expect(failingCell.className).toContain("text-coral");
	});
});
