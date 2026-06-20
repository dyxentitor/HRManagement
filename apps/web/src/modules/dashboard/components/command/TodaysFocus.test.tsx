import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { PendingTask } from "../../api";
import { TodaysFocus } from "./TodaysFocus";

function renderFocus(tasks: PendingTask[]) {
	return render(
		<MemoryRouter>
			<TodaysFocus tasks={tasks} />
		</MemoryRouter>,
	);
}

describe("TodaysFocus", () => {
	it("renders an action card per task linking to its route", () => {
		renderFocus([
			{
				key: "leave_approvals",
				label: "Leave approvals",
				count: 18,
				tone: "peach",
				action_route: "/approvals",
			},
		]);
		const link = screen.getByRole("link", { name: /Leave approvals/ });
		expect(link).toHaveAttribute("href", "/approvals");
		expect(screen.getByText("18")).toBeInTheDocument();
		expect(screen.getByText(/Review/)).toBeInTheDocument();
	});

	it("renders nothing when there are no tasks", () => {
		const { container } = renderFocus([]);
		expect(container).toBeEmptyDOMElement();
	});
});
