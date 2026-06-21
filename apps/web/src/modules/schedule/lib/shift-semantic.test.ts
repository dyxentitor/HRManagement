import { describe, expect, it } from "vitest";

import type { CellTone } from "./cell-tone";
import { cellLabel, isAssignable, semanticLabel } from "./shift-semantic";

describe("shift-semantic", () => {
	it("maps codes to semantic words", () => {
		expect(semanticLabel("M")).toBe("DAY");
		expect(semanticLabel("N")).toBe("NIGHT");
		expect(semanticLabel("E")).toBe("EVE");
	});

	it("falls back to the shift name keywords", () => {
		expect(semanticLabel("Z", "Night Patrol")).toBe("NIGHT");
		expect(semanticLabel("Z", "Morning crew")).toBe("DAY");
	});

	it("cellLabel shows the word in week view and a letter in month view", () => {
		const shift: CellTone = { kind: "shift", letter: "N", tone: "lavender", isPublished: true };
		expect(cellLabel(shift, "Night", "week")).toBe("NIGHT");
		expect(cellLabel(shift, "Night", "month")).toBe("N");
		const leave: CellTone = { kind: "leave", letter: "L", tone: "mint" };
		expect(cellLabel(leave, null, "week")).toBe("LEAVE");
		const off: CellTone = { kind: "off", letter: "X", tone: "surface" };
		expect(cellLabel(off, null, "week")).toBe("");
		expect(isAssignable(off)).toBe(true);
		expect(isAssignable(shift)).toBe(false);
	});
});
