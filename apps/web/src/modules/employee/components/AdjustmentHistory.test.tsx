import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ adjustmentHistory: vi.fn() }));
vi.mock("@/modules/leave/api", () => ({ leaveApi: api }));

import { AdjustmentHistory } from "./AdjustmentHistory";

beforeEach(() => {
	api.adjustmentHistory.mockReset();
});

describe("AdjustmentHistory", () => {
	it("renders the before→after, reason and performer", async () => {
		api.adjustmentHistory.mockResolvedValue([
			{
				ts: "2026-06-21T08:00:00Z",
				leave_type: "Annual",
				delta: "2",
				before: "9.00",
				after: "11.00",
				note: "Manual correction",
				performed_by: "hr@x.com",
			},
		]);
		render(<AdjustmentHistory employeeId="e1" />);
		// timeline groups the entry under a relative bucket; text nodes are combined
		await waitFor(() => expect(screen.getByText(/Manual correction/)).toBeInTheDocument());
		expect(screen.getByText(/9\.00 → 11\.00/)).toBeInTheDocument(); // before → after
		expect(screen.getByText(/hr@x\.com/)).toBeInTheDocument();
	});

	it("shows an empty state when there are no adjustments", async () => {
		api.adjustmentHistory.mockResolvedValue([]);
		render(<AdjustmentHistory employeeId="e1" />);
		await waitFor(() => expect(screen.getByText(/no manual adjustments yet/i)).toBeInTheDocument());
	});
});
