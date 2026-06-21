import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConflictsPanel } from "./ConflictsPanel";

describe("ConflictsPanel", () => {
	it("shows the ready state when there are no conflicts", () => {
		render(<ConflictsPanel warnings={[]} />);
		expect(screen.getByText(/ready to publish/i)).toBeInTheDocument();
	});

	it("lists each conflict with its message and a count", () => {
		render(
			<ConflictsPanel
				warnings={[
					{ rule: "overtime", message: "Rajesh has 54h scheduled" },
					{ rule: "coverage_drop", message: "SOC coverage on 2026-03-03: 0/1" },
				]}
			/>,
		);
		expect(screen.getByText(/2 conflicts to review/i)).toBeInTheDocument();
		expect(screen.getByText(/Rajesh has 54h scheduled/)).toBeInTheDocument();
		expect(screen.getByText(/SOC coverage/)).toBeInTheDocument();
	});
});
