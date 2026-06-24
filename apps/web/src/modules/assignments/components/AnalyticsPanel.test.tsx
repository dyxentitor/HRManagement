import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ analytics: vi.fn() }));
vi.mock("../api", () => ({ assignmentsApi: api }));

import { AnalyticsPanel } from "./AnalyticsPanel";

beforeEach(() => {
	api.analytics.mockReset().mockResolvedValue({
		totals: { total: 4, completed: 2, overdue: 1, pending: 2, completion_rate: 50 },
		by_department: [{ department: "Eng", total: 4, completed: 2, overdue: 1 }],
		by_type: [{ type: "task", total: 4, completed: 2 }],
	});
});

describe("AnalyticsPanel", () => {
	it("renders completion rate and department breakdown", async () => {
		render(<AnalyticsPanel />);
		await waitFor(() => expect(screen.getByText("50%")).toBeInTheDocument());
		expect(screen.getByText("Eng")).toBeInTheDocument();
		expect(screen.getByText("2/4")).toBeInTheDocument();
	});
});
