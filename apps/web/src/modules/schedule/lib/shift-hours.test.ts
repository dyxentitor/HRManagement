import { describe, expect, it } from "vitest";

import { formatTimeRange, shiftHours } from "./shift-hours";

describe("shiftHours", () => {
	it("computes a normal day shift", () => {
		expect(shiftHours("09:00", "17:00", false)).toBe(8);
	});
	it("wraps past midnight", () => {
		expect(shiftHours("21:00", "06:00", true)).toBe(9);
	});
	it("wraps when end <= start even if flag is false", () => {
		expect(shiftHours("22:00", "06:00", false)).toBe(8);
	});
	it("returns 0 when a bound is missing", () => {
		expect(shiftHours("", "17:00", false)).toBe(0);
	});
});

describe("formatTimeRange", () => {
	it("trims seconds to HH:MM–HH:MM", () => {
		expect(formatTimeRange("09:00:00", "17:30:00")).toBe("09:00–17:30");
	});
	it("returns empty string when a bound is missing", () => {
		expect(formatTimeRange("", "17:00")).toBe("");
	});
});
