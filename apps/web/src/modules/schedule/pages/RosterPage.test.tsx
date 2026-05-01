import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
	scheduleApi: {
		calendar: vi.fn().mockResolvedValue({
			range: { from: "2026-03-01", to: "2026-03-07" },
			teams: [],
			shifts: [],
			assignments: [],
			leaves: [],
			holidays: [],
			stats: { by_day: [], totals: { hours: 0, headcount: 0 }, coverage: [] },
		}),
		publish: vi.fn(),
		bulkFill: vi.fn(),
		coverUp: vi.fn(),
		deleteAssignment: vi.fn(),
	},
	teamApi: { list: vi.fn().mockResolvedValue([]) },
}));

import RosterPage from "./RosterPage";

describe("RosterPage", () => {
	beforeEach(() => localStorage.clear());

	it("renders header + toolbar + empty grid after load", async () => {
		render(<RosterPage />);
		await waitFor(() => {
			expect(screen.getByText("Roster")).toBeInTheDocument();
			expect(screen.getByText("Build Roster")).toBeInTheDocument();
		});
	});
});
