import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addDaysIso, startOfWeekIsoLocal } from "../lib/local-date";

const mocks = vi.hoisted(() => ({
	myAssignments: vi.fn(),
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
		listHolidays: mocks.listHolidays,
	},
}));

import MySchedulePage from "./MySchedulePage";

// Place the holiday inside the week the page will actually render.
const weekStart = startOfWeekIsoLocal(new Date());
const holidayDate = addDaysIso(weekStart, 2);

beforeEach(() => {
	mocks.myAssignments.mockReset();
	mocks.listHolidays.mockReset();
	mocks.today.mockReset();
	mocks.myAssignments.mockResolvedValue([]);
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
	it("marks a public holiday in the header tooltip and the legend", async () => {
		renderPage();
		expect(await screen.findByTitle("Test Holiday")).toBeInTheDocument();
		expect(screen.getByText(/Test Holiday/)).toBeInTheDocument();
	});
});
