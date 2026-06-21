import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ConflictsPanel } from "./ConflictsPanel";

describe("ConflictsPanel", () => {
	it("shows the ready state when there are no conflicts", () => {
		render(<ConflictsPanel warnings={[]} />);
		expect(screen.getByText(/ready to publish/i)).toBeInTheDocument();
	});

	it("is collapsed by default — a one-line count + by-rule summary, no messages", () => {
		render(
			<ConflictsPanel
				warnings={[
					{ rule: "overtime", message: "Rajesh has 54h scheduled" },
					{ rule: "coverage_drop", message: "SOC coverage on 2026-03-03: 0/1" },
				]}
			/>,
		);
		expect(screen.getByText(/2 conflicts/i)).toBeInTheDocument();
		expect(screen.getByText(/1 overtime/i)).toBeInTheDocument();
		expect(screen.getByText(/1 coverage/i)).toBeInTheDocument();
		// the detailed messages are hidden until expanded
		expect(screen.queryByText(/Rajesh has 54h scheduled/)).not.toBeInTheDocument();
	});

	it("expands to reveal each conflict message", async () => {
		const user = userEvent.setup();
		render(
			<ConflictsPanel
				warnings={[
					{ rule: "overtime", message: "Rajesh has 54h scheduled" },
					{ rule: "coverage_drop", message: "SOC coverage on 2026-03-03: 0/1" },
				]}
			/>,
		);
		await user.click(screen.getByRole("button"));
		expect(screen.getByText(/Rajesh has 54h scheduled/)).toBeInTheDocument();
		expect(screen.getByText(/SOC coverage/)).toBeInTheDocument();
	});
});
