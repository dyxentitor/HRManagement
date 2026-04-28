import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const employees = [
	{
		id: "1",
		full_name: "Ops Lead",
		role_title: "SOC Lead",
		email: "ops@provintell.local",
		phone: "+60 12 345 6789",
		department_id: "ops",
		department_name: "Operations",
		attendance_pct: 98,
	},
	{
		id: "2",
		full_name: "Eng Lead",
		role_title: "Eng Lead",
		email: "eng@provintell.local",
		phone: "+60 12 000 0000",
		department_id: "eng",
		department_name: "Engineering",
		attendance_pct: 92,
	},
];

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	can: () => true,
}));

vi.mock("@/lib/perm", () => ({ useCan: () => mocks.can() }));
vi.mock("../api", () => ({ employeeApi: { list: mocks.list } }));

import EmployeesPage from "./EmployeesPage";

function renderPage() {
	return render(
		<MemoryRouter>
			<EmployeesPage />
		</MemoryRouter>,
	);
}

describe("EmployeesPage", () => {
	it("renders an EmployeeCard per employee in card view", async () => {
		mocks.list.mockResolvedValue(employees);
		renderPage();
		await waitFor(() => {
			expect(screen.getByText("Ops Lead")).toBeInTheDocument();
		});
		// "Eng Lead" appears in both the h3 and the role_title span (same text), so use getAllByText
		expect(screen.getAllByText("Eng Lead").length).toBeGreaterThanOrEqual(1);
	});

	it("toggles to table view", async () => {
		const user = userEvent.setup();
		mocks.list.mockResolvedValue(employees);
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		await user.click(screen.getByRole("button", { name: /table view/i }));
		expect(screen.getByRole("table")).toBeInTheDocument();
	});

	it("filters by department", async () => {
		const user = userEvent.setup();
		mocks.list.mockResolvedValue(employees);
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		const select = screen.getByRole("combobox", { name: /department/i });
		await user.selectOptions(select, "ops");
		expect(screen.getByText("Ops Lead")).toBeInTheDocument();
		expect(screen.queryByText("Eng Lead")).not.toBeInTheDocument();
	});

	it("renders empty state when no employees", async () => {
		mocks.list.mockResolvedValue([]);
		renderPage();
		await waitFor(() => {
			expect(screen.getByText(/No employees here/i)).toBeInTheDocument();
		});
	});
});
