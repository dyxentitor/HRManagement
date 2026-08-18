import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addDaysIso, startOfWeekIsoLocal, todayIsoLocal } from "../lib/local-date";

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
vi.mock("@/lib/auth", () => ({
	useAuth: () => ({ perms: new Set(["attendance:clock:self"]) }),
}));
vi.mock("../swap-api", () => ({
	listSwapCandidates: vi.fn().mockResolvedValue([]),
	createSwapRequest: vi.fn(),
	listMySwapRequests: vi.fn().mockResolvedValue([]),
	cancelSwapRequest: vi.fn(),
}));

import MySchedulePage from "./MySchedulePage";

// Place the holiday inside the week the page will actually render — but NOT on
// today: today's card renders as the hero (no title= attr), so a holiday landing
// on the current day made this test fail every Wednesday (weekStart+2 == today).
const weekStart = startOfWeekIsoLocal(new Date());
const holidayDate =
	addDaysIso(weekStart, 2) === todayIsoLocal()
		? addDaysIso(weekStart, 3)
		: addDaysIso(weekStart, 2);
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

describe("MySchedulePage swap action", () => {
	it("shows Request swap button for a future published scheduled assignment", async () => {
		// A future date strictly after today.
		const futureDate = addDaysIso(todayIsoLocal(), 2);
		mocks.myAssignments.mockResolvedValue([
			{
				id: "a-future",
				employee: "self",
				employee_code: "",
				shift: "sh1",
				shift_name: "Morning",
				shift_code: "M",
				covering_for: null,
				covering_for_name: null,
				work_date: futureDate,
				status: "scheduled",
				published_at: "2026-08-01T00:00:00Z",
				is_published: true,
				notes: "",
			},
		]);
		renderPage();
		// The button must appear on the future card.
		expect(
			await screen.findByRole("button", { name: /request swap/i }),
		).toBeInTheDocument();
	});

	it("does NOT show Request swap for today's assignment (not strictly future)", async () => {
		// Today is not strictly in the future (iso > todayIso is false for today).
		const todayDate = todayIsoLocal();
		mocks.myAssignments.mockResolvedValue([
			{
				id: "a-today",
				employee: "self",
				employee_code: "",
				shift: "sh1",
				shift_name: "Morning",
				shift_code: "M",
				covering_for: null,
				covering_for_name: null,
				work_date: todayDate,
				status: "scheduled",
				published_at: "2026-08-01T00:00:00Z",
				is_published: true,
				notes: "",
			},
		]);
		renderPage();
		// Wait for the page to render the shift name in the week grid.
		// (Today's shift also shows in the hero, so "Morning" will appear.)
		expect(await screen.findByText("Shifts")).toBeInTheDocument();
		// No swap button — today is not strictly future.
		expect(
			screen.queryByRole("button", { name: /request swap/i }),
		).not.toBeInTheDocument();
	});
});
