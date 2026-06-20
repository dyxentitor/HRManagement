// Shared tone maps for the leave module (kept in one place so hero, calendar,
// history and the detail drawer agree on colors).

import {
	Baby,
	BedDouble,
	CalendarClock,
	CalendarDays,
	HeartHandshake,
	HeartPulse,
	Moon,
	Palmtree,
} from "lucide-react";
import type { ComponentType } from "react";

import type { LeaveRequestStatus } from "../api";

export type Tone = "lavender" | "coral" | "peach" | "sky" | "mint" | "yellow";

const TYPE_TONE: Record<string, Tone> = {
	ANNUAL: "lavender",
	SICK: "coral",
	REPLACEMENT: "peach",
	COMPASSIONATE: "sky",
	MATERNITY: "mint",
	PATERNITY: "mint",
	HOSPITALIZATION: "sky",
	UNPAID: "yellow",
};

export function typeTone(code: string): Tone {
	return TYPE_TONE[code] ?? "lavender";
}

export const STATUS_TONE: Record<string, "mint" | "yellow" | "coral" | "sky"> = {
	approved: "mint",
	submitted: "yellow",
	rejected: "coral",
	cancelled: "sky",
	withdrawn: "sky",
	draft: "sky",
};

export const TONE_BG: Record<Tone, string> = {
	lavender: "bg-lavender",
	coral: "bg-coral",
	peach: "bg-peach",
	sky: "bg-sky",
	mint: "bg-mint",
	yellow: "bg-yellow",
};

export const TONE_ICON_BG: Record<Tone, string> = {
	lavender: "bg-lavender/15 text-lavender",
	coral: "bg-coral/15 text-coral",
	peach: "bg-peach/15 text-peach",
	sky: "bg-sky/15 text-sky",
	mint: "bg-mint/15 text-mint",
	yellow: "bg-yellow/15 text-yellow",
};

// --- Per-type icon + explainer copy ------------------------------------------

const TYPE_ICON: Record<string, ComponentType<{ className?: string }>> = {
	ANNUAL: Palmtree,
	SICK: HeartPulse,
	HOSPITALIZATION: BedDouble,
	MATERNITY: Baby,
	PATERNITY: Baby,
	COMPASSIONATE: HeartHandshake,
	REPLACEMENT: CalendarClock,
	UNPAID: Moon,
};

export function typeIcon(code: string): ComponentType<{ className?: string }> {
	return TYPE_ICON[code] ?? CalendarDays;
}

const TYPE_COPY: Record<string, string> = {
	ANNUAL: "Paid time off for rest and holidays. Plan ahead so your team has cover.",
	SICK: "For illness — attach a medical certificate for 2+ consecutive days.",
	HOSPITALIZATION: "Extended medical leave for hospital stays and recovery.",
	MATERNITY: "Paid leave around childbirth. Notify HR early to arrange cover.",
	PATERNITY: "Paid leave for new fathers, subject to eligibility.",
	COMPASSIONATE: "Time off for bereavement or a family emergency.",
	REPLACEMENT: "Time off earned for working on a rest day or public holiday.",
	UNPAID: "Leave without pay when your paid balance is used up.",
};

export function typeCopy(code: string): string {
	return TYPE_COPY[code] ?? "Apply and your manager will review it.";
}

// --- Request journey (stepper) -----------------------------------------------

export const LEAVE_STAGES = ["Submitted", "In review", "Approved"] as const;
export type StageState = "done" | "current" | "upcoming";

export function stageStates(status: LeaveRequestStatus): StageState[] {
	switch (status) {
		case "draft":
			return ["current", "upcoming", "upcoming"];
		case "submitted":
			return ["done", "current", "upcoming"];
		case "approved":
			return ["done", "done", "done"];
		case "rejected":
			return ["done", "current", "upcoming"];
		default: // cancelled / withdrawn
			return ["upcoming", "upcoming", "upcoming"];
	}
}

export function stageNote(status: LeaveRequestStatus): string {
	switch (status) {
		case "draft":
			return "Draft · not submitted";
		case "submitted":
			return "In review · with your manager";
		case "approved":
			return "Approved";
		case "rejected":
			return "Rejected";
		case "cancelled":
			return "Cancelled";
		default:
			return "Withdrawn";
	}
}

/** Requests still awaiting a decision (shown in "In progress"). */
export function isInFlight(status: LeaveRequestStatus): boolean {
	return status === "draft" || status === "submitted";
}

export function num(s: string | null | undefined): number {
	const n = Number(s ?? 0);
	return Number.isFinite(n) ? n : 0;
}

/** "1 day" / "2 days" / "0.5 day". */
export function fmtDays(value: number | string): string {
	const n = typeof value === "string" ? num(value) : value;
	return `${n} day${n === 1 ? "" : "s"}`;
}
