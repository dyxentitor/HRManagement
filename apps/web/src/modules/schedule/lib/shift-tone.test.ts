import { describe, expect, it } from "vitest";

import { TONE_DOT, shiftCodeTone } from "./shift-tone";

describe("shiftCodeTone", () => {
	it("maps known codes", () => {
		expect(shiftCodeTone("M")).toBe("accent");
		expect(shiftCodeTone("N")).toBe("sky");
	});
	it("falls back to accent", () => {
		expect(shiftCodeTone("Z")).toBe("accent");
	});
	it("has a dot class for every tone", () => {
		expect(TONE_DOT.accent).toMatch(/bg-/);
		expect(TONE_DOT.sky).toMatch(/bg-/);
	});
});
