/**
 * Weekday helpers for schedule grids. UTC-only from the YYYY-MM-DD key
 * (CLAUDE.md §3.9 — avoids the Asia/KL midnight drift that bit v1.10.0).
 */

/** "Saturday" (long), "Mon" (short) or "M" (narrow) for a YYYY-MM-DD key, in UTC. */
export function weekdayLabel(
	iso: string,
	variant: "long" | "short" | "narrow",
): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
		weekday: variant,
		timeZone: "UTC",
	});
}

/** True when the YYYY-MM-DD key falls on Saturday or Sunday (UTC). */
export function isWeekendIso(iso: string): boolean {
	const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
	return dow === 0 || dow === 6;
}
