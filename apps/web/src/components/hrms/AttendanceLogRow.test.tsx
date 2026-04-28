import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AttendanceLogRow } from "./AttendanceLogRow";

describe("AttendanceLogRow", () => {
	it("renders name and clock-in time", () => {
		render(
			<AttendanceLogRow
				name="Ops Lead"
				clockIn="09:15"
				clockOut={null}
				status={{ tone: "mint", label: "On time" }}
			/>,
		);
		expect(screen.getByText("Ops Lead")).toBeInTheDocument();
		expect(screen.getByText(/09:15/)).toBeInTheDocument();
		expect(screen.getByText("On time")).toBeInTheDocument();
	});

	it("renders dash for missing clock-out", () => {
		render(
			<AttendanceLogRow
				name="Eng Lead"
				clockIn="09:00"
				clockOut={null}
				status={{ tone: "mint", label: "On time" }}
			/>,
		);
		expect(screen.getByText(/Out —/)).toBeInTheDocument();
	});

	it("shows late minutes when status carries them", () => {
		render(
			<AttendanceLogRow
				name="Analyst One"
				clockIn="09:35"
				clockOut={null}
				status={{ tone: "yellow", label: "Late · 5m" }}
			/>,
		);
		expect(screen.getByText(/Late · 5m/)).toBeInTheDocument();
	});
});
