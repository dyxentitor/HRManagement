import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Holiday, LeaveRequest } from "../api";
import { LeaveCalendar } from "./LeaveCalendar";

const requests = [
	{
		id: "1",
		employee_id: "e",
		leave_type: "a",
		leave_type_code: "ANNUAL",
		start_date: "2026-06-24",
		end_date: "2026-06-25",
		total_days: "2",
		is_half_day: false,
		half_day_period: "",
		reason: "",
		status: "submitted",
		current_level: 1,
		submitted_at: null,
		decided_at: null,
	},
] as unknown as LeaveRequest[];

const holidays = [{ date: "2026-06-26", name: "Awal Muharram", type: "federal" }] as Holiday[];

describe("LeaveCalendar", () => {
	it("marks leave days and holidays in the right month", () => {
		render(
			<LeaveCalendar month={new Date("2026-06-15T00:00:00Z")} requests={requests} holidays={holidays} />,
		);
		// day 24 cell carries the leave-type marker
		const codes = screen.getAllByText("ANNUAL");
		expect(codes.length).toBeGreaterThanOrEqual(1);
		// the holiday name is exposed via the cell title
		expect(screen.getByTitle("Awal Muharram")).toBeInTheDocument();
	});
});
