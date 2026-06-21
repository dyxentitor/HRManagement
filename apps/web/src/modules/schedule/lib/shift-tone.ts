import type { Tone } from "./cell-tone";

/**
 * Shift-code → tone, shared with the roster grid so colours stay consistent.
 * Aligned to the Roster spec's shift semantics: Morning/Day = blue, Night =
 * purple, Evening = orange, Swing = amber.
 */
export const SHIFT_CODE_TONE: Record<string, Tone> = {
	M: "sky",
	D: "sky",
	N: "lavender",
	E: "peach",
	S: "yellow",
};

export function shiftCodeTone(code: string): Tone {
	return SHIFT_CODE_TONE[code] ?? "accent";
}

/** Solid dot background class per tone. */
export const TONE_DOT: Record<Tone, string> = {
	accent: "bg-accent-500",
	lavender: "bg-lavender",
	sky: "bg-sky",
	yellow: "bg-yellow",
	mint: "bg-mint",
	peach: "bg-peach",
	coral: "bg-coral",
};
