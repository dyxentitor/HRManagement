import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmployeeCard } from "./EmployeeCard";

const employee = {
	id: "1",
	full_name: "Ops Lead",
	role_title: "SOC Lead",
	email: "ops@provintell.local",
	phone: "+60 12 345 6789",
};

describe("EmployeeCard", () => {
	it("renders name and role", () => {
		render(
			<EmployeeCard
				employee={employee}
				metric={{ label: "Attendance", value: 98, max: 100 }}
			/>,
		);
		expect(screen.getByText("Ops Lead")).toBeInTheDocument();
		expect(screen.getByText("SOC Lead")).toBeInTheDocument();
	});

	it("calls onView when view icon is clicked", async () => {
		const user = userEvent.setup();
		const onView = vi.fn();
		render(
			<EmployeeCard
				employee={employee}
				metric={{ label: "Attendance", value: 98, max: 100 }}
				onView={onView}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /view profile/i }));
		expect(onView).toHaveBeenCalledWith(employee.id);
	});

	it("renders metric label and value", () => {
		render(
			<EmployeeCard
				employee={employee}
				metric={{ label: "Attendance", value: 98, max: 100 }}
			/>,
		);
		expect(screen.getByText(/Attendance/)).toBeInTheDocument();
		expect(screen.getByText(/98%/)).toBeInTheDocument();
	});
});
