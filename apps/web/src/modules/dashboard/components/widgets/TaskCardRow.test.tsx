import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { PendingTask } from "../../api";
import { TaskCardRow } from "./TaskCardRow";

function renderRow(tasks: PendingTask[]) {
	return render(
		<MemoryRouter>
			<TaskCardRow tasks={tasks} />
		</MemoryRouter>,
	);
}

describe("TaskCardRow", () => {
	it("renders a pill per task linking to its route", () => {
		renderRow([
			{
				key: "payroll_exceptions",
				label: "Payroll exceptions",
				count: 2,
				tone: "yellow",
				action_route: "/payroll/admin",
			},
		]);
		const link = screen.getByRole("link", { name: /Payroll exceptions/ });
		expect(link).toHaveAttribute("href", "/payroll/admin");
		expect(screen.getByText("2")).toBeInTheDocument();
	});

	it("renders nothing when there are no tasks", () => {
		const { container } = renderRow([]);
		expect(container).toBeEmptyDOMElement();
	});
});
