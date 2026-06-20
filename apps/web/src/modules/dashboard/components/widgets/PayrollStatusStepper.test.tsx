import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PayrollStatusData } from "../../api";
import { PayrollStatusStepper } from "./PayrollStatusStepper";

describe("PayrollStatusStepper", () => {
	it("renders all five stages with the current one labelled", () => {
		const data: PayrollStatusData = {
			current: "ready",
			pay_date: "2026-06-28",
			stages: [
				{ key: "draft", label: "Draft", state: "done" },
				{ key: "approved", label: "Approved", state: "done" },
				{ key: "ready", label: "Ready", state: "current" },
				{ key: "processing", label: "Processing", state: "upcoming" },
				{ key: "completed", label: "Completed", state: "upcoming" },
			],
		};
		render(<PayrollStatusStepper data={data} />);
		expect(screen.getByText("Ready")).toBeInTheDocument();
		expect(screen.getByText("Completed")).toBeInTheDocument();
		expect(screen.getByText(/Pay date/)).toBeInTheDocument();
	});

	it("shows an empty state when there is no active period", () => {
		render(
			<PayrollStatusStepper
				data={{ current: null, pay_date: null, stages: [] }}
			/>,
		);
		expect(screen.getByText(/No active payroll period/)).toBeInTheDocument();
	});
});
