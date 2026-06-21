import type { OnboardingOverall, ProgressRow } from "./onboarding-board-api";

export type PillTone = "mint" | "sky" | "lavender" | "peach" | "coral";

export const OVERALL_TONE: Record<OnboardingOverall, PillTone> = {
	complete: "mint",
	in_progress: "sky",
	activating: "lavender",
	invited: "peach",
	needs_attention: "coral",
};

export const OVERALL_LABEL: Record<OnboardingOverall, string> = {
	complete: "Complete",
	in_progress: "In progress",
	activating: "Activating",
	invited: "Invited",
	needs_attention: "Needs attention",
};

export type StepState = "done" | "now" | "wait";
export interface StepCell {
	label: string;
	state: StepState;
	text: string;
}

/** The 5-step track shown per hire (Invite → Password → Profile → Prefs → Tasks). */
export function stepTrack(r: ProgressRow): StepCell[] {
	const pwDone = r.account_activated;
	const pct = r.profile_percent;
	const prefsDone =
		r.wizard_completed || (r.wizard_step != null && ["review", "ready"].includes(r.wizard_step));
	const tasksDone = r.checklist_total > 0 && r.checklist_done === r.checklist_total;
	return [
		{ label: "Invite", state: "done", text: "✓" },
		{
			label: "Password",
			state: pwDone ? "done" : r.invitation_status === "opened" ? "now" : "wait",
			text: pwDone ? "✓" : "·",
		},
		{
			label: "Profile",
			state: pct === 100 ? "done" : pct != null ? "now" : "wait",
			text: pct != null ? String(pct) : "·",
		},
		{
			label: "Prefs",
			state: prefsDone ? "done" : pwDone ? "now" : "wait",
			text: prefsDone ? "✓" : "·",
		},
		{
			label: "Tasks",
			state: tasksDone ? "done" : r.checklist_total > 0 ? "now" : "wait",
			text: `${r.checklist_done}/${r.checklist_total || 0}`,
		},
	];
}

export interface Funnel {
	inProgress: number;
	needsHelp: number;
	complete: number;
	total: number;
}

export function funnel(rows: ProgressRow[]): Funnel {
	let inProgress = 0;
	let needsHelp = 0;
	let complete = 0;
	for (const r of rows) {
		if (r.overall === "complete") complete += 1;
		else if (r.overall === "needs_attention") needsHelp += 1;
		else inProgress += 1;
	}
	return { inProgress, needsHelp, complete, total: rows.length };
}

export function initials(name: string): string {
	const p = name.trim().split(/\s+/);
	return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}
