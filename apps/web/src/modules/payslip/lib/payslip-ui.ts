import type { PayslipRecord } from "../api";

export function num(s: string | null | undefined): number {
	const n = Number(s ?? 0);
	return Number.isFinite(n) ? n : 0;
}

export function fmtMoney(amount: number, currency = "MYR"): string {
	return `${currency} ${amount.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

/** "June 2026" from a period_start (falls back to published_at / created_at). */
export function monthLabel(p: PayslipRecord): string {
	const iso = p.period_start ?? p.published_at ?? p.created_at;
	if (!iso) return "—";
	return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-MY", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
}

/** "28 Jun 2026" from the pay date (or published date). */
export function payDateLabel(p: PayslipRecord): string {
	const iso = p.pay_date ?? p.published_at;
	if (!iso) return "—";
	return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
}

function yearOf(p: PayslipRecord): number {
	const iso = p.period_start ?? p.published_at ?? p.created_at;
	return iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCFullYear() : 0;
}

export function isPublished(p: PayslipRecord): boolean {
	return p.status === "published" || p.status === "sent";
}

/** Sort newest-first by the period (then pay date) so the latest is first. */
export function sortNewestFirst(payslips: PayslipRecord[]): PayslipRecord[] {
	return [...payslips].sort((a, b) =>
		(b.period_start ?? b.published_at ?? "").localeCompare(a.period_start ?? a.published_at ?? ""),
	);
}

export interface YearSummary {
	net: number;
	deducted: number;
	count: number;
	currency: string;
}

/** Year-to-date totals across this year's published payslips. */
export function yearSummary(payslips: PayslipRecord[], year: number): YearSummary {
	const rows = payslips.filter((p) => isPublished(p) && yearOf(p) === year);
	let net = 0;
	let deducted = 0;
	let currency = "MYR";
	for (const p of rows) {
		net += num(p.net);
		deducted += num(p.gross) - num(p.net);
		if (p.currency_code) currency = p.currency_code;
	}
	return { net, deducted, count: rows.length, currency };
}

export const STATUS_TONE: Record<PayslipRecord["status"], "yellow" | "mint"> = {
	draft: "yellow",
	published: "mint",
	sent: "mint",
};

export const STATUS_LABEL: Record<PayslipRecord["status"], string> = {
	draft: "Draft",
	published: "Published",
	sent: "Sent",
};
