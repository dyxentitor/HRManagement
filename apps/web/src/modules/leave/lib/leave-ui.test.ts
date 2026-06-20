import { describe, expect, it } from "vitest";

import { isInFlight, stageStates } from "./leave-ui";

describe("leave-ui journey", () => {
	it("maps request status to the 3-stage journey", () => {
		expect(stageStates("draft")).toEqual(["current", "upcoming", "upcoming"]);
		expect(stageStates("submitted")).toEqual(["done", "current", "upcoming"]);
		expect(stageStates("approved")).toEqual(["done", "done", "done"]);
	});

	it("treats only draft/submitted as in-flight", () => {
		expect(isInFlight("draft")).toBe(true);
		expect(isInFlight("submitted")).toBe(true);
		expect(isInFlight("approved")).toBe(false);
		expect(isInFlight("rejected")).toBe(false);
		expect(isInFlight("cancelled")).toBe(false);
	});
});
