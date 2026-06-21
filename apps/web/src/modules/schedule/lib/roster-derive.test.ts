import { describe, expect, it } from "vitest";

import type { CalendarPayload } from "../api";
import { rosterMetrics } from "./roster-derive";

function payload(over: Partial<CalendarPayload> = {}): CalendarPayload {
	return {
		range: { from: "2026-03-01", to: "2026-03-31" },
		teams: [
			{
				id: "t1",
				name: "SOC",
				sort_order: 0,
				min_headcount: 1,
				parent_team_id: null,
				members: [
					{
						id: "e1",
						full_name: "A B",
						employee_code: "E1",
						status: "active",
						department_name: "Ops",
						role_title: "Analyst",
						team_id: "t1",
					},
				],
			},
		],
		shifts: [],
		assignments: [],
		leaves: [],
		holidays: [],
		stats: {
			by_day: [],
			totals: { hours: 0, headcount: 0 },
			coverage: [
				{
					team_id: "t1",
					team_name: "SOC",
					by_day: [
						{ date: "2026-03-02", scheduled: 1, min: 1, ok: true },
						{ date: "2026-03-03", scheduled: 0, min: 1, ok: false },
					],
				},
			],
		},
		warnings: [{ rule: "coverage_drop", message: "SOC coverage on 2026-03-03: 0/1" }],
		...over,
	};
}

describe("rosterMetrics", () => {
	it("derives employee count, coverage %, short coverage and conflict count", () => {
		const m = rosterMetrics(payload());
		expect(m.employeeCount).toBe(1);
		expect(m.coveragePct).toBe(50); // 1 of 2 coverage cells ok
		expect(m.shortCoverageCount).toBe(1);
		expect(m.conflictCount).toBe(1);
	});

	it("reports 100% coverage when no team has a minimum", () => {
		const m = rosterMetrics(
			payload({ stats: { by_day: [], totals: { hours: 0, headcount: 0 }, coverage: [] } }),
		);
		expect(m.coveragePct).toBe(100);
	});
});
