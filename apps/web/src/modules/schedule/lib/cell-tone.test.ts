import { describe, expect, it } from "vitest";

import { type CellInputs, resolveCellTone } from "./cell-tone";

const baseEmp = { id: "e1", status: "active" as const };

function mkAssignment(
	overrides: Partial<{
		shift_code: string;
		covering_for_id: string | null;
		covering_for_name: string | null;
		is_published: boolean;
	}> = {},
) {
	return {
		id: "a1",
		employee_id: "e1",
		work_date: "2026-03-04",
		shift_id: "s1",
		shift_code: overrides.shift_code ?? "M",
		covering_for_id: overrides.covering_for_id ?? null,
		covering_for_name: overrides.covering_for_name ?? null,
		is_published: overrides.is_published ?? true,
		notes: "",
	};
}

function mk(overrides: Partial<CellInputs> = {}): CellInputs {
	return {
		employee: baseEmp,
		date: "2026-03-04",
		assignment: undefined,
		leaves: [],
		holidays: [],
		...overrides,
	};
}

describe("resolveCellTone", () => {
	it("returns 'inactive' when employee.status != active", () => {
		const t = resolveCellTone(
			mk({
				employee: { id: "e1", status: "terminated" as const },
			}),
		);
		expect(t.kind).toBe("inactive");
	});

	it("returns 'leave' when employee has approved leave on this date", () => {
		const t = resolveCellTone(
			mk({
				leaves: [{ employee_id: "e1", date: "2026-03-04", type: "annual" }],
			}),
		);
		expect(t.kind).toBe("leave");
		expect(t.letter).toBe("L");
	});

	it("returns 'cover-up' when assignment.covering_for_id is set", () => {
		const t = resolveCellTone(
			mk({
				assignment: mkAssignment({ covering_for_id: "e2" }),
			}),
		);
		expect(t.kind).toBe("cover-up");
		expect(t.letter).toBe("M");
	});

	it("returns 'shift' for normal assignment with M code mapped to sky (blue)", () => {
		const t = resolveCellTone(mk({ assignment: mkAssignment() }));
		expect(t.kind).toBe("shift");
		expect(t.tone).toBe("sky");
		expect(t.letter).toBe("M");
	});

	it("returns 'off' for empty cell on a weekday", () => {
		const t = resolveCellTone(mk({ date: "2026-03-04" })); // Wed
		expect(t.kind).toBe("off");
		expect(t.letter).toBe("X");
	});

	it("returns 'weekend' for empty cell on Saturday", () => {
		const t = resolveCellTone(mk({ date: "2026-03-07" })); // Sat
		expect(t.kind).toBe("weekend");
	});

	it("priority: leave beats cover-up beats shift", () => {
		const t = resolveCellTone(
			mk({
				assignment: mkAssignment({ covering_for_id: "e2" }),
				leaves: [{ employee_id: "e1", date: "2026-03-04", type: "annual" }],
			}),
		);
		expect(t.kind).toBe("leave");
	});

	it("Night shift uses lavender tone", () => {
		const t = resolveCellTone(
			mk({
				assignment: mkAssignment({ shift_code: "N" }),
			}),
		);
		expect(t.tone).toBe("lavender");
		expect(t.letter).toBe("N");
	});

	it("Day shift uses sky tone", () => {
		const t = resolveCellTone(
			mk({
				assignment: mkAssignment({ shift_code: "D" }),
			}),
		);
		expect(t.tone).toBe("sky");
	});
});
