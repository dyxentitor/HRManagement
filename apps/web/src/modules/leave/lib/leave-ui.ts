// Shared tone maps for the leave module (kept in one place so hero, calendar,
// history and the detail drawer agree on colors).

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
