// UTC-safe date helpers for leave grids (CLAUDE.md §3.9 — never use a local-tz
// Date as a day key; build keys from `${iso}T00:00:00Z`).

export function utcDate(iso: string): Date {
	return new Date(`${iso}T00:00:00Z`);
}

export function ymd(d: Date): string {
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
		d.getUTCDate(),
	).padStart(2, "0")}`;
}

/** Whole days from today (local midnight) until the given ISO date. */
export function daysUntil(iso: string): number {
	const t = new Date();
	const todayUtc = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
	return Math.round((utcDate(iso).getTime() - todayUtc) / 86_400_000);
}

/** "24–25 Jun 2026" · single day → "24 Jun 2026" · cross-month → full both ends. */
export function formatRange(start: string, end: string): string {
	const s = utcDate(start);
	const e = utcDate(end);
	const full: Intl.DateTimeFormatOptions = {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	};
	if (start === end) return s.toLocaleDateString("en-MY", full);
	const sameMonth =
		s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
	if (sameMonth) {
		const month = s.toLocaleDateString("en-MY", {
			month: "short",
			year: "numeric",
			timeZone: "UTC",
		});
		return `${s.getUTCDate()}–${e.getUTCDate()} ${month}`;
	}
	return `${s.toLocaleDateString("en-MY", full)} – ${e.toLocaleDateString("en-MY", full)}`;
}

/** Inclusive list of YYYY-MM-DD keys between start and end (UTC-safe). */
export function dateKeysBetween(start: string, end: string): string[] {
	const keys: string[] = [];
	const cur = utcDate(start);
	const last = utcDate(end);
	while (cur.getTime() <= last.getTime()) {
		keys.push(ymd(cur));
		cur.setUTCDate(cur.getUTCDate() + 1);
	}
	return keys;
}
