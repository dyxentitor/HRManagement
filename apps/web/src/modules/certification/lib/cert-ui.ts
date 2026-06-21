import type { Certification, TrainingAssignment } from "../api";

export type Tone = "mint" | "yellow" | "coral" | "sky" | "lavender";

const DAY = 1000 * 60 * 60 * 24;

function startOfTodayUtc(): number {
	const now = new Date();
	return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Whole days from today until an ISO date (negative = in the past). UTC-safe. */
export function daysUntil(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const t = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
	return Math.round((t - startOfTodayUtc()) / DAY);
}

export function fmtDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
}

export const EXPIRING_SOON_DAYS = 30;

export function isExpired(c: Certification): boolean {
	if (c.status === "expired" || c.status === "revoked") return true;
	const d = daysUntil(c.expires_on);
	return d !== null && d < 0;
}

export function isExpiringSoon(c: Certification): boolean {
	if (isExpired(c)) return false;
	const d = daysUntil(c.expires_on);
	return d !== null && d <= EXPIRING_SOON_DAYS;
}

/** Status pill for a cert row. */
export function certStatusView(c: Certification): { label: string; tone: Tone } {
	if (isExpired(c)) return { label: "Expired", tone: "coral" };
	const d = daysUntil(c.expires_on);
	if (d !== null && d <= EXPIRING_SOON_DAYS) return { label: `In ${d}d`, tone: "yellow" };
	return { label: "Active", tone: "mint" };
}

export interface CertSummary {
	total: number;
	active: number;
	expiring: number;
	expired: number;
	compliancePct: number;
	nextToExpire: Certification | null;
}

export function certSummary(certs: Certification[]): CertSummary {
	let active = 0;
	let expiring = 0;
	let expired = 0;
	for (const c of certs) {
		if (isExpired(c)) expired += 1;
		else if (isExpiringSoon(c)) expiring += 1;
		else active += 1;
	}
	const total = certs.length;
	const good = active + expiring; // anything not expired is "in good standing"
	const compliancePct = total === 0 ? 100 : Math.round((good / total) * 100);
	const nextToExpire =
		certs
			.filter((c) => !isExpired(c) && c.expires_on)
			.sort((a, b) => (a.expires_on ?? "").localeCompare(b.expires_on ?? ""))[0] ?? null;
	return { total, active, expiring, expired, compliancePct, nextToExpire };
}

// ── Training ───────────────────────────────────────────────────────────────

export function isOverdue(a: TrainingAssignment): boolean {
	if (a.status === "completed") return false;
	if (a.status === "overdue") return true;
	const d = daysUntil(a.due_date);
	return d !== null && d < 0;
}

export function assignmentStatusView(a: TrainingAssignment): {
	label: string;
	tone: Tone;
	pct: number;
} {
	const latest = a.progress?.[a.progress.length - 1];
	const pct = a.status === "completed" ? 100 : Number(latest?.progress_pct ?? 0);
	if (a.status === "completed") return { label: "Done", tone: "mint", pct: 100 };
	if (isOverdue(a)) return { label: "Overdue", tone: "coral", pct: Math.max(pct, 5) };
	if (a.status === "in_progress") return { label: "In progress", tone: "sky", pct };
	return { label: "Assigned", tone: "lavender", pct };
}

export interface TrainingSummary {
	total: number;
	done: number;
	inProgress: number;
	overdue: number;
	completionPct: number;
	mostUrgent: TrainingAssignment | null;
}

export function trainingSummary(items: TrainingAssignment[]): TrainingSummary {
	let done = 0;
	let overdue = 0;
	let inProgress = 0;
	for (const a of items) {
		if (a.status === "completed") done += 1;
		else if (isOverdue(a)) overdue += 1;
		else inProgress += 1;
	}
	const total = items.length;
	const completionPct = total === 0 ? 0 : Math.round((done / total) * 100);
	const mostUrgent =
		items
			.filter((a) => a.status !== "completed")
			.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0] ?? null;
	return { total, done, inProgress, overdue, completionPct, mostUrgent };
}

export const TONE_TEXT: Record<Tone, string> = {
	mint: "text-mint",
	yellow: "text-yellow",
	coral: "text-coral",
	sky: "text-sky",
	lavender: "text-lavender",
};
