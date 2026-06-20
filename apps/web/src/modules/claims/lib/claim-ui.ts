import {
	GraduationCap,
	HeartPulse,
	Laptop,
	Plane,
	Receipt,
	UtensilsCrossed,
} from "lucide-react";
import type { ComponentType } from "react";

import type { ClaimRequest, ClaimStatus } from "../api";

export type Tone = "yellow" | "sky" | "lavender" | "mint" | "coral" | "peach";

export const STATUS_TONE: Record<ClaimStatus, Tone> = {
	draft: "yellow",
	submitted: "sky",
	manager_approved: "lavender",
	finance_approved: "lavender",
	reimbursed: "mint",
	rejected: "coral",
	cancelled: "peach",
};

export const STATUS_LABEL: Record<ClaimStatus, string> = {
	draft: "Draft",
	submitted: "Submitted",
	manager_approved: "Manager approved",
	finance_approved: "Approved",
	reimbursed: "Paid",
	rejected: "Rejected",
	cancelled: "Cancelled",
};

interface CatMeta {
	icon: ComponentType<{ className?: string }>;
	tone: Tone;
}

const CAT_RULES: { match: RegExp; meta: CatMeta }[] = [
	{ match: /medic|health|clinic|hospital|dental/i, meta: { icon: HeartPulse, tone: "coral" } },
	{ match: /travel|trip|transport|mileage|flight|taxi/i, meta: { icon: Plane, tone: "sky" } },
	{ match: /equip|asset|device|laptop|hardware|tool/i, meta: { icon: Laptop, tone: "lavender" } },
	{ match: /train|course|educat|cert|learn|book/i, meta: { icon: GraduationCap, tone: "mint" } },
	{ match: /meal|food|entertain|dining/i, meta: { icon: UtensilsCrossed, tone: "yellow" } },
];

export function categoryMeta(codeOrName: string): CatMeta {
	for (const r of CAT_RULES) if (r.match.test(codeOrName)) return r.meta;
	return { icon: Receipt, tone: "peach" };
}

export const TONE_CHIP: Record<Tone, string> = {
	yellow: "bg-yellow/15 text-yellow",
	sky: "bg-sky/15 text-sky",
	lavender: "bg-lavender/15 text-lavender",
	mint: "bg-mint/15 text-mint",
	coral: "bg-coral/15 text-coral",
	peach: "bg-peach/15 text-peach",
};

export type Bucket = "pending" | "approved" | "paid" | "rejected";

export function bucketOf(status: ClaimStatus): Bucket | null {
	if (status === "submitted" || status === "manager_approved") return "pending";
	if (status === "finance_approved") return "approved";
	if (status === "reimbursed") return "paid";
	if (status === "rejected") return "rejected";
	return null; // draft / cancelled not summarised
}

export function num(s: string | null | undefined): number {
	const n = Number(s ?? 0);
	return Number.isFinite(n) ? n : 0;
}

export interface BucketStat {
	count: number;
	amount: number;
	currency: string;
}

export function summarise(claims: ClaimRequest[]): Record<Bucket, BucketStat> {
	const base: Record<Bucket, BucketStat> = {
		pending: { count: 0, amount: 0, currency: "MYR" },
		approved: { count: 0, amount: 0, currency: "MYR" },
		paid: { count: 0, amount: 0, currency: "MYR" },
		rejected: { count: 0, amount: 0, currency: "MYR" },
	};
	for (const c of claims) {
		const b = bucketOf(c.status);
		if (!b) continue;
		base[b].count += 1;
		base[b].amount += num(c.amount);
		if (c.currency_code) base[b].currency = c.currency_code;
	}
	return base;
}

export function fmtMoney(amount: number, currency = "MYR"): string {
	return `${currency} ${amount.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function fmtDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}
