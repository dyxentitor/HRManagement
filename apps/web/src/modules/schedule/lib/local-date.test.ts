import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	addDaysIso,
	isoLocalDate,
	startOfWeekIsoLocal,
	todayIsoLocal,
} from "./local-date";

const ORIGINAL_TZ = process.env.TZ;

describe("local-date helpers (regression: v1.10.1 sweep Bugs #5/#6)", () => {
	beforeEach(() => {
		// 2026-05-14 19:30:00 UTC === 2026-05-15 03:30 in Asia/Kuala_Lumpur (UTC+8).
		// That window is where `Date.toISOString().slice(0,10)` slips by a day
		// against the local calendar. Every test below pins this moment.
		process.env.TZ = "Asia/Kuala_Lumpur";
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-14T19:30:00Z"));
	});
	afterEach(() => {
		vi.useRealTimers();
		process.env.TZ = ORIGINAL_TZ;
	});

	it("todayIsoLocal returns the KL local date, not the UTC date", () => {
		expect(todayIsoLocal()).toBe("2026-05-15");
		// Sanity: the legacy bug would have produced this.
		expect(new Date().toISOString().slice(0, 10)).toBe("2026-05-14");
	});

	it("isoLocalDate uses local accessors", () => {
		// 2026-05-15 03:30 KL → local date is 2026-05-15
		expect(isoLocalDate(new Date())).toBe("2026-05-15");
	});

	it("startOfWeekIsoLocal returns Monday of the local week", () => {
		// 2026-05-15 is Friday → Monday is 2026-05-11
		expect(startOfWeekIsoLocal(new Date())).toBe("2026-05-11");
	});

	it("addDaysIso walks the date via UTC anchors (DST-safe)", () => {
		expect(addDaysIso("2026-05-11", 0)).toBe("2026-05-11");
		expect(addDaysIso("2026-05-11", 6)).toBe("2026-05-17");
		expect(addDaysIso("2026-05-11", -3)).toBe("2026-05-08");
	});
});
