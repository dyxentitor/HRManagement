import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CalendarStats } from "../api";
import { StatsFooter } from "./StatsFooter";

const stats: CalendarStats = {
	by_day: [
		{ date: "2026-03-04", hours: 24, headcount: 8 },
		{ date: "2026-03-05", hours: 16, headcount: 4 },
		{ date: "2026-03-07", hours: 0, headcount: 0 },
	],
	totals: { hours: 312, headcount: 14 },
	coverage: [
		{
			team_id: "t1",
			team_name: "L1",
			by_day: [
				{ date: "2026-03-04", scheduled: 2, min: 2, ok: true },
				{ date: "2026-03-05", scheduled: 1, min: 2, ok: false },
				{ date: "2026-03-07", scheduled: 0, min: 2, ok: false },
			],
		},
	],
};

describe("StatsFooter", () => {
	it("shows totals and the team label", () => {
		render(<StatsFooter stats={stats} />);
		expect(screen.getByText(/Hours: 312/)).toBeInTheDocument();
		expect(screen.getByText(/Headcount: 14/)).toBeInTheDocument();
		expect(screen.getByText("L1")).toBeInTheDocument();
	});

	it("colours coverage chips: met=mint, partial=amber, zero=coral", () => {
		render(<StatsFooter stats={stats} />);
		expect(screen.getByTitle("2 of 2 scheduled").className).toMatch(/mint/);
		expect(screen.getByTitle("1 of 2 scheduled").className).toMatch(/yellow/);
		expect(screen.getByTitle("0 of 2 scheduled").className).toMatch(/coral/);
	});
});
