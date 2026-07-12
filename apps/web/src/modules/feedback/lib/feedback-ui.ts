import type { FeedbackCategory, FeedbackStatus } from "../api";

export type Tone = "yellow" | "sky" | "lavender" | "mint" | "coral" | "peach";

export const STATUS_TONE: Record<FeedbackStatus, Tone> = {
	new: "sky",
	in_review: "yellow",
	resolved: "mint",
	closed: "lavender",
};

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
	new: "New",
	in_review: "In Review",
	resolved: "Resolved",
	closed: "Closed",
};

export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
	bug: "Bug",
	feature: "Feature Request",
	improvement: "Improvement",
	uiux: "UI / UX",
	performance: "Performance",
	security: "Security",
	documentation: "Documentation",
	general: "General",
};

export const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
	{ value: "bug", label: "Bug" },
	{ value: "feature", label: "Feature Request" },
	{ value: "improvement", label: "Improvement" },
	{ value: "uiux", label: "UI / UX" },
	{ value: "performance", label: "Performance" },
	{ value: "security", label: "Security" },
	{ value: "documentation", label: "Documentation" },
	{ value: "general", label: "General" },
];

export function fmtDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}
