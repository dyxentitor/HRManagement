import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../api";

vi.mock("../api", () => ({
	scheduleApi: {
		calendar: vi.fn(),
		publish: vi.fn(),
		bulkFill: vi.fn(),
		bulkAssign: vi.fn(),
		coverUp: vi.fn(),
		deleteAssignment: vi.fn(),
	},
	teamApi: { list: vi.fn() },
}));

import RosterPage from "./RosterPage";

const populatedCalendar = {
	range: { from: "2026-03-02", to: "2026-03-08" },
	teams: [
		{
			id: "t1",
			name: "Focus",
			sort_order: 0,
			min_headcount: null,
			parent_team_id: null,
			members: [
				{
					id: "e1",
					full_name: "Syafiq",
					employee_code: "EMP001",
					status: "active" as const,
					department_name: "L1",
					role_title: "Lead",
					team_id: "t1",
				},
			],
		},
	],
	shifts: [
		{
			id: "s1",
			code: "M",
			name: "Morning",
			start_time: "09:00",
			end_time: "18:00",
			color: "#7c5cff",
			crosses_midnight: false,
		},
	],
	assignments: [],
	leaves: [],
	holidays: [],
	stats: { by_day: [], totals: { hours: 0, headcount: 0 }, coverage: [] },
	warnings: [],
};

describe("RosterPage", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.mocked(api.scheduleApi.calendar).mockResolvedValue(populatedCalendar);
		vi.mocked(api.teamApi.list).mockResolvedValue([]);
		vi.mocked(api.scheduleApi.bulkFill).mockResolvedValue({
			created: 0,
			updated: 0,
			warnings: [],
		});
		vi.mocked(api.scheduleApi.deleteAssignment).mockResolvedValue(undefined);
	});

	it("renders header + toolbar + empty grid after load", async () => {
		render(<RosterPage />);
		await waitFor(() => {
			expect(screen.getByText("Roster Planning")).toBeInTheDocument();
			expect(screen.getByText("Build Roster")).toBeInTheDocument();
		});
	});

	it("clicking employee name opens panel for that employee", async () => {
		render(<RosterPage />);
		await waitFor(() => screen.getByRole("button", { name: "Open Syafiq" }));
		await userEvent.click(screen.getByRole("button", { name: "Open Syafiq" }));
		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: "Row editor" })).toBeInTheDocument();
		});
	});

	it("clicking a cell opens panel scrolled to that day", async () => {
		render(<RosterPage />);
		await waitFor(() => screen.getAllByRole("button"));
		const cells = screen.getAllByRole("button").filter((b) => b.textContent === "+");
		await userEvent.click(cells[0]);
		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: "Row editor" })).toBeInTheDocument();
		});
	});

	it("still renders the grid when teamApi.list rejects (e.g. 403)", async () => {
		vi.mocked(api.teamApi.list).mockRejectedValueOnce(
			new Error("HTTP 403: GET /api/v1/teams/ failed"),
		);
		render(<RosterPage />);
		await waitFor(() => {
			expect(screen.getByText("Roster Planning")).toBeInTheDocument();
			expect(screen.getByText("Build Roster")).toBeInTheDocument();
		});
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
