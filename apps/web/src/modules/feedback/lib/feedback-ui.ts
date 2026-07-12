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

export function relativeTime(iso: string | null | undefined): string {
	if (!iso) return "";
	const diffMs = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diffMs / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	if (days < 7) return `${days}d ago`;
	const weeks = Math.floor(days / 7);
	return `${weeks}w ago`;
}

export function fmtDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}
