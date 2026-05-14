/**
 * Local-timezone date helpers for the schedule module.
 *
 * Why this exists: CLAUDE.md §3.9 documents that `Date.toISOString().slice(0,10)`
 * on a local-time `Date` drifts by one day in `Asia/Kuala_Lumpur` between
 * midnight and 08:00 KL. The v1.10.0 Playwright sweep filed Bugs #5 + #6
 * because two schedule pages hit exactly this trap (MySchedulePage "Today"
 * header and the RosterPage week range).
 *
 * Use these helpers any time you have a local-time `Date` and need its
 * YYYY-MM-DD key. For grids that walk a date range, keep using the
 * UTC-anchored pattern (`new Date(\`${iso}T00:00:00Z\`)` + `setUTCDate(...+1)`)
 * — those are correct because both the anchor and the walker live in UTC.
 */

/** YYYY-MM-DD string for the local date inside the given `Date`. */
export function isoLocalDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** Today's local date as YYYY-MM-DD. */
export function todayIsoLocal(): string {
	return isoLocalDate(new Date());
}

/**
 * Add N calendar days to a YYYY-MM-DD string and return the new YYYY-MM-DD.
 * Uses UTC math so DST and timezone edges don't drift the result.
 */
export function addDaysIso(iso: string, days: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/**
 * YYYY-MM-DD for the Monday of the week containing the given local-time Date.
 * Week starts on Monday (ISO 8601, matches the grid headers).
 */
export function startOfWeekIsoLocal(d: Date): string {
	const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
	const diff = (day + 6) % 7; // how many days back to Monday
	const monday = new Date(d);
	monday.setDate(d.getDate() - diff);
	return isoLocalDate(monday);
}
