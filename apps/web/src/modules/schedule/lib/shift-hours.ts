/** Shift duration + time-range formatting from "HH:MM[:SS]" strings. */

function toMinutes(t: string): number {
	const [h, m] = t.split(":").map(Number);
	return h * 60 + (m || 0);
}

/** Duration in hours; wraps when crossesMidnight or end <= start. */
export function shiftHours(
	start: string,
	end: string,
	crossesMidnight: boolean,
): number {
	if (!start || !end) return 0;
	const s = toMinutes(start);
	let e = toMinutes(end);
	if (crossesMidnight || e <= s) e += 24 * 60;
	return Math.round(((e - s) / 60) * 100) / 100;
}

/** "09:00–17:00" (en-dash), or "" if either bound is missing. */
export function formatTimeRange(start: string, end: string): string {
	if (!start || !end) return "";
	return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
}
