import type { CalendarAssignment, CalendarEmployee, CalendarHoliday, CalendarLeave } from "../api";
import { SHIFT_CODE_TONE } from "./shift-tone";
import { isWeekendIso } from "./weekday";

export type Tone = "accent" | "lavender" | "sky" | "yellow" | "mint" | "peach" | "coral";

export type CellTone =
	| { kind: "inactive"; letter: ""; tone: "muted" }
	| { kind: "leave"; letter: "L"; tone: "mint" }
	| {
			kind: "cover-up";
			letter: string;
			tone: Tone;
			coveringForName: string | null;
	  }
	| { kind: "shift"; letter: string; tone: Tone; isPublished: boolean }
	| { kind: "off"; letter: "X"; tone: "surface" }
	| { kind: "weekend"; letter: "X"; tone: "weekend" };

export interface CellInputs {
	employee: Pick<CalendarEmployee, "id" | "status">;
	date: string;
	assignment: CalendarAssignment | undefined;
	leaves: CalendarLeave[];
	holidays: CalendarHoliday[];
}

export function resolveCellTone(inp: CellInputs): CellTone {
	if (inp.employee.status !== "active") {
		return { kind: "inactive", letter: "", tone: "muted" };
	}
	const onLeave = inp.leaves.some((l) => l.employee_id === inp.employee.id && l.date === inp.date);
	if (onLeave) {
		return { kind: "leave", letter: "L", tone: "mint" };
	}
	if (inp.assignment) {
		const tone = SHIFT_CODE_TONE[inp.assignment.shift_code] ?? "accent";
		if (inp.assignment.covering_for_id) {
			return {
				kind: "cover-up",
				letter: inp.assignment.shift_code,
				tone,
				coveringForName: inp.assignment.covering_for_name,
			};
		}
		return {
			kind: "shift",
			letter: inp.assignment.shift_code,
			tone,
			isPublished: inp.assignment.is_published,
		};
	}
	if (isWeekendIso(inp.date)) {
		return { kind: "weekend", letter: "X", tone: "weekend" };
	}
	return { kind: "off", letter: "X", tone: "surface" };
}
