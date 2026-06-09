import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addDaysIso, startOfWeekIsoLocal } from "../lib/local-date";

const mocks = vi.hoisted(() => ({
	myAssignments: vi.fn(),
	listShifts: vi.fn(),
	listHolidays: vi.fn(),
	today: vi.fn(),
	clockIn: vi.fn(),
	clockOut: vi.fn(),
}));

vi.mock("@/modules/attendance/api", () => ({
	ApiError: class ApiError extends Error {
		status = 0;
	},
	attendanceApi: {
		today: mocks.today,
		clockIn: mocks.clockIn,
		clockOut: mocks.clockOut,
	},
}));
vi.mock("../api", () => ({
	scheduleApi: {
		myAssignments: mocks.myAssignments,
		listShifts: mocks.listShifts,
		listHolidays: mocks.listHolidays,
	},
}));

import MySchedulePage from "./MySchedulePage";

// Place the holiday inside the week the page will actually render.
const weekStart = startOfWeekIsoLocal(new Date());
const holidayDate = addDaysIso(weekStart, 2);
// ~2 months out — guaranteed a different calendar month than the viewed week.
const outOfMonthDate = addDaysIso(weekStart, 60);

beforeEach(() => {
	mocks.myAssignments.mockReset();
	mocks.listShifts.mockReset();
	mocks.listHolidays.mockReset();
	mocks.today.mockReset();
	mocks.myAssignments.mockResolvedValue([]);
	mocks.listShifts.mockResolvedValue([
		{
			id: "sh1",
			code: "M",
			name: "Morning",
			start_time: "09:00:00",
			end_time: "17:00:00",
			crosses_midnight: false,
			color: "#7c5cff",
		},
	]);
	mocks.today.mockResolvedValue(null);
	mocks.listHolidays.mockResolvedValue([
		{ id: "h1", date: holidayDate, name: "Test Holiday", type: "company" },
	]);
});

function renderPage() {
	return render(
		<MemoryRouter>
			<MySchedulePage />
		</MemoryRouter>,
	);
}

describe("MySchedulePage holidays", () => {
	it("shows this-month holidays as cards and marks the day", async () => {
		renderPage();
		expect(await screen.findByTitle("Test Holiday")).toBeInTheDocument(); // day-card dot
		expect(screen.getByText(/Test Holiday/)).toBeInTheDocument(); // month card
		expect(screen.getByText(/Holidays in/)).toBeInTheDocument(); // heading
	});

	it("excludes holidays from other months", async () => {
		mocks.listHolidays.mockResolvedValue([
			{ id: "in", date: holidayDate, name: "In Month", type: "federal" },
			{ id: "out", date: outOfMonthDate, name: "Other Month", type: "federal" },
		]);
		renderPage();
		expect(await screen.findByText("In Month")).toBeInTheDocument();
		expect(screen.queryByText("Other Month")).not.toBeInTheDocument();
	});

	it("shows an empty state when the visible month has no holidays", async () => {
		mocks.listHolidays.mockResolvedValue([
			{ id: "out", date: outOfMonthDate, name: "Other Month", type: "federal" },
		]);
		renderPage();
		expect(
			await screen.findByText(/No public holidays in/),
		).toBeInTheDocument();
	});
});

describe("MySchedulePage week summary", () => {
	it("renders the KPI strip and a shift card with its time range", async () => {
		mocks.myAssignments.mockResolvedValue([
			{
				id: "a1",
				employee: "self",
				employee_code: "",
				shift: "sh1",
				shift_name: "Morning",
				shift_code: "M",
				covering_for: null,
				covering_for_name: null,
				work_date: addDaysIso(weekStart, 0),
				status: "scheduled",
				published_at: null,
				is_published: true,
				notes: "",
			},
		]);
		renderPage();
		expect(await screen.findByText("Shifts")).toBeInTheDocument();
		expect(screen.getByText("Hours")).toBeInTheDocument();
		expect(screen.getByText("Days off")).toBeInTheDocument();
		expect(await screen.findByText("09:00–17:00")).toBeInTheDocument();
	});
});
