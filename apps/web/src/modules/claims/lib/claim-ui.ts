import {
	Boxes,
	Car,
	GraduationCap,
	HeartHandshake,
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

/**
 * Status to show the employee. The approval engine keeps `status` at "submitted"
 * while the chain is mid-flight (it needs that to keep acting) and only advances
 * `current_level` per approval. So once `current_level > 1` the manager (level 1)
 * has approved — surface that as "manager_approved" instead of "submitted".
 */
export function displayStatus(claim: {
	status: ClaimStatus;
	current_level: number;
}): ClaimStatus {
	if (claim.status === "submitted" && Number(claim.current_level) > 1) {
		return "manager_approved";
	}
	return claim.status;
}

interface CatMeta {
	icon: ComponentType<{ className?: string }>;
	tone: Tone;
}

// First match wins — order matters. Ground transport is checked before the
// broader travel rule so "Transportation" gets a car rather than a plane.
const CAT_RULES: { match: RegExp; meta: CatMeta }[] = [
	{ match: /medic|health|clinic|hospital|dental/i, meta: { icon: HeartPulse, tone: "coral" } },
	{ match: /transport|mileage|taxi|grab|commut/i, meta: { icon: Car, tone: "sky" } },
	{ match: /travel|trip|flight/i, meta: { icon: Plane, tone: "sky" } },
	{ match: /software|saas|licen[cs]e|subscription/i, meta: { icon: Laptop, tone: "lavender" } },
	{ match: /equip|asset|device|laptop|hardware|tool/i, meta: { icon: Laptop, tone: "lavender" } },
	{ match: /train|course|educat|cert|learn|book/i, meta: { icon: GraduationCap, tone: "mint" } },
	{ match: /office|supplies|stationery|printer|paper/i, meta: { icon: Boxes, tone: "yellow" } },
	{ match: /welfare|wellbeing|wellness|morale|team building/i, meta: { icon: HeartHandshake, tone: "peach" } },
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

// --- Claim journey (stepper) -------------------------------------------------

export const CLAIM_STAGES = ["Submitted", "Manager", "Finance", "Paid"] as const;
export type StageState = "done" | "current" | "upcoming";

/** Per-stage state for the 4-step claim journey, given the claim status. */
export function stageStates(status: ClaimStatus): StageState[] {
	switch (status) {
		case "draft":
			return ["current", "upcoming", "upcoming", "upcoming"];
		case "submitted":
			return ["done", "current", "upcoming", "upcoming"];
		case "manager_approved":
			return ["done", "done", "current", "upcoming"];
		case "finance_approved":
			return ["done", "done", "done", "current"];
		case "reimbursed":
			return ["done", "done", "done", "done"];
		case "rejected":
			return ["done", "done", "upcoming", "upcoming"];
		default: // cancelled
			return ["upcoming", "upcoming", "upcoming", "upcoming"];
	}
}

/** Short human note about where a claim is in the flow. */
export function stageNote(status: ClaimStatus): string {
	switch (status) {
		case "draft":
			return "Draft · not submitted";
		case "submitted":
			return "Awaiting manager review";
		case "manager_approved":
			return "With finance";
		case "finance_approved":
			return "Approved · paid soon";
		case "reimbursed":
			return "Paid";
		case "rejected":
			return "Rejected";
		default:
			return "Cancelled";
	}
}

/** Claims still moving through the flow (shown in "In progress"). */
export function isInFlight(status: ClaimStatus): boolean {
	return (
		status === "draft" ||
		status === "submitted" ||
		status === "manager_approved" ||
		status === "finance_approved"
	);
}

// --- Category explainer copy (feature cards) ---------------------------------

const CAT_COPY: { match: RegExp; copy: string }[] = [
	{
		match: /medic|health|clinic|dental/i,
		copy: "Clinic visits, prescriptions and dental. Receipt required — usually paid within a week.",
	},
	{
		match: /transport|mileage|taxi|grab|commut/i,
		copy: "Taxis, e-hailing, mileage and parking for work trips. Itemised receipts speed approval.",
	},
	{
		match: /travel|trip|flight/i,
		copy: "Flights and accommodation for work trips. Itemised receipts speed approval.",
	},
	{
		match: /software|saas|licen[cs]e|subscription/i,
		copy: "Software licences, SaaS subscriptions and developer tools. Larger renewals may need pre-approval.",
	},
	{
		match: /equip|asset|device|laptop|hardware|tool/i,
		copy: "Monitors, peripherals and tools for your role. Larger items may need pre-approval.",
	},
	{
		match: /train|course|educat|cert|learn|book/i,
		copy: "Courses, books and certifications that grow your skills.",
	},
	{
		match: /office|supplies|stationery|printer|paper/i,
		copy: "Stationery, printing and everyday supplies for the office.",
	},
	{
		match: /welfare|wellbeing|wellness|morale|team building/i,
		copy: "Team meals, wellbeing and staff engagement activities on approved occasions.",
	},
	{ match: /meal|food|entertain|dining/i, copy: "Client and team meals on approved occasions." },
];

export function categoryCopy(codeOrName: string, requiresAttachment: boolean): string {
	for (const r of CAT_COPY) if (r.match.test(codeOrName)) return r.copy;
	return requiresAttachment
		? "Describe the expense and attach a receipt."
		: "Describe the expense — no receipt needed.";
}
