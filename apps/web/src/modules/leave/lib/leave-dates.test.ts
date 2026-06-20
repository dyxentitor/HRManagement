import { describe, expect, it } from "vitest";

import { dateKeysBetween, formatRange } from "./leave-dates";

describe("leave-dates", () => {
	it("formats a multi-day range compactly", () => {
		expect(formatRange("2026-06-24", "2026-06-25")).toBe("24–25 Jun 2026");
	});
	it("formats a single day", () => {
		expect(formatRange("2026-06-24", "2026-06-24")).toBe("24 Jun 2026");
	});
	it("formats a cross-month range with both ends", () => {
		expect(formatRange("2026-06-29", "2026-07-02")).toBe(
			"29 Jun 2026 – 2 Jul 2026",
		);
	});
	it("lists inclusive UTC day keys", () => {
		expect(dateKeysBetween("2026-06-24", "2026-06-26")).toEqual([
			"2026-06-24",
			"2026-06-25",
			"2026-06-26",
		]);
	});
});
