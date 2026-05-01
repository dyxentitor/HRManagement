import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../api";

vi.mock("../api", () => ({
	scheduleApi: {
		calendar: vi.fn(),
		publish: vi.fn(),
		bulkFill: vi.fn(),
		coverUp: vi.fn(),
		deleteAssignment: vi.fn(),
	},
	teamApi: { list: vi.fn() },
}));

import RosterPage from "./RosterPage";

const emptyCalendar = {
	range: { from: "2026-03-01", to: "2026-03-07" },
	teams: [],
	shifts: [],
	assignments: [],
	leaves: [],
	holidays: [],
	stats: { by_day: [], totals: { hours: 0, headcount: 0 }, coverage: [] },
};

describe("RosterPage", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.mocked(api.scheduleApi.calendar).mockResolvedValue(emptyCalendar);
		vi.mocked(api.teamApi.list).mockResolvedValue([]);
	});

	it("renders header + toolbar + empty grid after load", async () => {
		render(<RosterPage />);
		await waitFor(() => {
			expect(screen.getByText("Roster")).toBeInTheDocument();
			expect(screen.getByText("Build Roster")).toBeInTheDocument();
		});
	});

	it("still renders the grid when teamApi.list rejects (e.g. 403)", async () => {
		vi.mocked(api.teamApi.list).mockRejectedValueOnce(
			new Error("HTTP 403: GET /api/v1/teams/ failed"),
		);
		render(<RosterPage />);
		await waitFor(() => {
			expect(screen.getByText("Roster")).toBeInTheDocument();
			expect(screen.getByText("Build Roster")).toBeInTheDocument();
		});
		// No alert role — calendar succeeded, only teams failed (silently degraded).
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("shows error and skips grid when calendar rejects", async () => {
		vi.mocked(api.scheduleApi.calendar).mockRejectedValueOnce(
			new Error("HTTP 500: calendar exploded"),
		);
		render(<RosterPage />);
		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeInTheDocument();
		});
	});
});
