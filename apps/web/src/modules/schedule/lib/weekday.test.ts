import { describe, expect, it } from "vitest";

import { isWeekendIso, weekdayLabel } from "./weekday";

describe("weekdayLabel", () => {
	it("returns short weekday names (UTC, no drift)", () => {
		expect(weekdayLabel("2026-06-08", "short")).toBe("Mon"); // Monday
		expect(weekdayLabel("2026-06-14", "short")).toBe("Sun");
	});
	it("returns single narrow letters", () => {
		expect(weekdayLabel("2026-06-08", "narrow")).toBe("M");
		expect(weekdayLabel("2026-06-10", "narrow")).toBe("W");
	});
	it("handles a year boundary", () => {
		expect(weekdayLabel("2027-01-01", "short")).toBe("Fri");
	});
});

describe("isWeekendIso", () => {
	it("is true for Sat/Sun, false for weekdays", () => {
		expect(isWeekendIso("2026-06-13")).toBe(true); // Sat
		expect(isWeekendIso("2026-06-14")).toBe(true); // Sun
		expect(isWeekendIso("2026-06-12")).toBe(false); // Fri
	});
});
