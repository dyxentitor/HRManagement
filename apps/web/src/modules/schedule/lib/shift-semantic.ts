import type { CellTone } from "./cell-tone";

/**
 * Map a shift code (falling back to its name) to a semantic word, so the grid
 * reads DAY / NIGHT / EVE instead of M / N / E. Keeps the roster from feeling
 * like a spreadsheet of abbreviations (Roster spec §Shift Visualization).
 */
const CODE_LABEL: Record<string, string> = {
	M: "DAY",
	D: "DAY",
	N: "NIGHT",
	E: "EVE",
	S: "SWING",
};

export function semanticLabel(code: string, name?: string | null): string {
	const c = (code || "").toUpperCase();
	if (CODE_LABEL[c]) return CODE_LABEL[c];
	const n = (name || "").toLowerCase();
	if (n.includes("night")) return "NIGHT";
	if (n.includes("even")) return "EVE";
	if (n.includes("morn") || n.includes("day")) return "DAY";
	if (n.includes("swing") || n.includes("split")) return "SWING";
	return (name || c || "SHIFT").slice(0, 5).toUpperCase();
}

/** Text shown inside a roster cell for its resolved tone + the current view. */
export function cellLabel(
	tone: CellTone,
	shiftName: string | null,
	viewMode: "week" | "month",
): string {
	if (tone.kind === "shift" || tone.kind === "cover-up") {
		const label = semanticLabel(tone.letter, shiftName);
		return viewMode === "month" ? label.slice(0, 1) : label;
	}
	if (tone.kind === "leave") return viewMode === "month" ? "L" : "LEAVE";
	return ""; // off / weekend / inactive → blank; the cell shows a hover "+"
}

/** Off/weekend cells are empty but assignable — they get the hover "+" hint. */
export function isAssignable(tone: CellTone): boolean {
	return tone.kind === "off" || tone.kind === "weekend";
}
