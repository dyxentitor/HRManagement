import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/employee/lib/format", () => ({ tenureFromHireDate: () => "2 yrs 5 mo" }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { EmployeeCard } from "./EmployeeCard";

const employee = {
	id: "e1",
	full_name: "Ops Lead",
	role_title: "SOC Lead",
	email: "ops@x.com",
	phone: "+60123",
	status: "active",
	hire_date: "2024-01-01",
	department_name: "Engineering",
};

beforeEach(() => {
	toast.success.mockReset();
});

describe("EmployeeCard", () => {
	it("renders name, role, status, department and tenure", () => {
		render(<EmployeeCard employee={employee} />);
		expect(screen.getByText("Ops Lead")).toBeInTheDocument();
		expect(screen.getByText("SOC Lead")).toBeInTheDocument();
		expect(screen.getByText("Active")).toBeInTheDocument();
		expect(screen.getByText("Engineering")).toBeInTheDocument();
		expect(screen.getByText("Tenure")).toBeInTheDocument();
		expect(screen.getByText("2 yrs 5 mo")).toBeInTheDocument();
		expect(screen.queryByText(/comments/i)).not.toBeInTheDocument();
	});

	it("fires onView and onEdit from the corner buttons", async () => {
		const onView = vi.fn();
		const onEdit = vi.fn();
		const user = userEvent.setup();
		render(<EmployeeCard employee={employee} onView={onView} onEdit={onEdit} />);
		await user.click(screen.getByRole("button", { name: /view profile/i }));
		expect(onView).toHaveBeenCalledWith("e1");
		await user.click(screen.getByRole("button", { name: /^edit$/i }));
		expect(onEdit).toHaveBeenCalledWith("e1");
	});

	it("hides Edit when onEdit is absent", () => {
		render(<EmployeeCard employee={employee} />);
		expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
	});

	it("copies the email to the clipboard on click", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		render(<EmployeeCard employee={employee} />);
		await user.click(screen.getByRole("button", { name: /copy email/i }));
		expect(writeText).toHaveBeenCalledWith("ops@x.com");
	});
});
