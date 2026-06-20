import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SmartInsightsData } from "../../api";
import { SmartInsights } from "./SmartInsights";

describe("SmartInsights", () => {
	it("shows only insights with non-zero / relevant values", () => {
		const data: SmartInsightsData = {
			payroll_days: 3,
			missing_docs: 5,
			contracts_expiring: 0,
			certs_expiring: 4,
			probation: 0,
			probation_ending: 0,
		};
		render(<SmartInsights data={data} />);
		expect(screen.getByText(/Payroll in 3 days/)).toBeInTheDocument();
		expect(screen.getByText(/5 missing docs/)).toBeInTheDocument();
		expect(screen.getByText(/4 certs expiring/)).toBeInTheDocument();
		// zero-valued insights are hidden
		expect(screen.queryByText(/contracts expire/)).not.toBeInTheDocument();
		expect(screen.queryByText(/on probation/)).not.toBeInTheDocument();
	});

	it("renders nothing when everything is clear", () => {
		const { container } = render(
			<SmartInsights
				data={{
					payroll_days: null,
					missing_docs: 0,
					contracts_expiring: 0,
					certs_expiring: 0,
					probation: 0,
					probation_ending: 0,
				}}
			/>,
		);
		expect(container).toBeEmptyDOMElement();
	});
});
