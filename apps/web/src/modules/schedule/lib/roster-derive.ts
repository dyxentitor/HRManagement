import type { CalendarPayload } from "../api";
import { semanticLabel } from "./shift-semantic";
import { todayIsoLocal } from "./local-date";

export interface RosterMetrics {
	employeeCount: number;
	/** Share of team/day coverage cells (with a min) that meet headcount. */
	coveragePct: number;
	conflictCount: number;
	unpublishedCount: number;
	shortCoverageCount: number;
	todayScheduled: number;
	todayDay: number;
	todayNight: number;
	todayOnLeave: number;
	todayInRange: boolean;
}

/** All the header/coverage numbers, derived from one calendar payload. */
export function rosterMetrics(payload: CalendarPayload): RosterMetrics {
	const employeeCount = payload.teams.reduce((n, t) => n + t.members.length, 0);

	let okCells = 0;
	let totalCells = 0;
	let short = 0;
	for (const team of payload.stats.coverage) {
		for (const d of team.by_day) {
			if (d.min > 0) {
				totalCells += 1;
				if (d.ok) okCells += 1;
				else short += 1;
			}
		}
	}
	const coveragePct = totalCells === 0 ? 100 : Math.round((okCells / totalCells) * 100);

	const unpublishedCount = payload.assignments.filter((a) => !a.is_published).length;

	const today = todayIsoLocal();
	const todayInRange = today >= payload.range.from && today <= payload.range.to;
	const todayAsg = todayInRange ? payload.assignments.filter((a) => a.work_date === today) : [];
	let todayNight = 0;
	for (const a of todayAsg) {
		if (semanticLabel(a.shift_code) === "NIGHT") todayNight += 1;
	}
	const todayDay = todayAsg.length - todayNight;
	const todayOnLeave = todayInRange
		? new Set(payload.leaves.filter((l) => l.date === today).map((l) => l.employee_id)).size
		: 0;

	return {
		employeeCount,
		coveragePct,
		conflictCount: payload.warnings.length,
		unpublishedCount,
		shortCoverageCount: short,
		todayScheduled: todayAsg.length,
		todayDay,
		todayNight,
		todayOnLeave,
		todayInRange,
	};
}
