import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEmployee = {
	id: "emp-1",
	full_name: "Alice Lim",
	employee_code: "PVT-001",
	role_title: "Engineer",
	department_id: "eng",
	department_name: "Engineering",
	email: "alice@provintell.local",
	phone: "+601234567890",
	status: "active",
	hire_date: "2024-01-15",
	employment_type: "fulltime",
	ic_last4: "1234",
};

const mocks = vi.hoisted(() => ({
	retrieve: vi.fn(),
	getReportingChain: vi.fn(),
	getDirectReports: vi.fn(),
	can: vi.fn(() => true),
}));

vi.mock("@/lib/perm", () => ({ useCan: () => mocks.can() }));
vi.mock("../api", () => ({
	employeeApi: {
		retrieve: mocks.retrieve,
		getReportingChain: mocks.getReportingChain,
		getDirectReports: mocks.getDirectReports,
	},
}));

import EmployeeDetailPage from "./EmployeeDetailPage";

beforeEach(() => {
	mocks.can.mockReturnValue(true);
	mocks.retrieve.mockReset();
	mocks.getReportingChain.mockReset();
	mocks.getDirectReports.mockReset();
});

function renderPage(id = "emp-1") {
	return render(
		<MemoryRouter initialEntries={[`/employees/${id}`]}>
			<Routes>
				<Route path="/employees/:id" element={<EmployeeDetailPage />} />
				<Route path="/" element={<div>home</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("EmployeeDetailPage", () => {
	it("renders employee name and role", async () => {
		mocks.retrieve.mockResolvedValue(mockEmployee);
		mocks.getReportingChain.mockResolvedValue([]);
		mocks.getDirectReports.mockResolvedValue([]);

		renderPage();
		await waitFor(() => {
			// Name appears in PageHeader h1 and avatar card h2
			expect(screen.getAllByText("Alice Lim").length).toBeGreaterThanOrEqual(1);
		});
		expect(screen.getByText("Engineer")).toBeInTheDocument();
	});

	it("renders employment section with code", async () => {
		mocks.retrieve.mockResolvedValue(mockEmployee);
		mocks.getReportingChain.mockResolvedValue([]);
		mocks.getDirectReports.mockResolvedValue([]);

		renderPage();
		await waitFor(() => screen.getByText("PVT-001"));
		expect(screen.getByText("Engineering")).toBeInTheDocument();
	});

	it("renders personal section when user has org read perm", async () => {
		mocks.retrieve.mockResolvedValue(mockEmployee);
		mocks.getReportingChain.mockResolvedValue([]);
		mocks.getDirectReports.mockResolvedValue([]);

		renderPage();
		await waitFor(() => screen.getByText("alice@provintell.local"));
		expect(screen.getByText(/•••• 1234/)).toBeInTheDocument();
	});

	it("hides personal section when user lacks org read perm", async () => {
		mocks.can.mockReturnValue(false);
		mocks.retrieve.mockResolvedValue(mockEmployee);
		mocks.getReportingChain.mockResolvedValue([]);
		mocks.getDirectReports.mockResolvedValue([]);

		renderPage();
		await waitFor(() => screen.getByText("PVT-001"));
		expect(
			screen.queryByText("alice@provintell.local"),
		).not.toBeInTheDocument();
	});

	it("renders reporting chain when present", async () => {
		mocks.retrieve.mockResolvedValue(mockEmployee);
		mocks.getReportingChain.mockResolvedValue([
			{ id: "mgr-1", full_name: "Bob Tan", role_title: "Manager", level: 1 },
		]);
		mocks.getDirectReports.mockResolvedValue([]);

		renderPage();
		await waitFor(() => screen.getByText("Bob Tan"));
		expect(screen.getByText("Reporting chain")).toBeInTheDocument();
	});

	it("renders direct reports when present", async () => {
		mocks.retrieve.mockResolvedValue(mockEmployee);
		mocks.getReportingChain.mockResolvedValue([]);
		mocks.getDirectReports.mockResolvedValue([
			{ id: "rep-1", full_name: "Carol Wong", role_title: "Junior Eng" },
		]);

		renderPage();
		await waitFor(() => screen.getByText("Carol Wong"));
		expect(screen.getByText(/Direct reports/)).toBeInTheDocument();
	});

	it("shows Edit and Archive buttons with employee:write:org and employee:archive", async () => {
		mocks.can.mockReturnValue(true);
		mocks.retrieve.mockResolvedValue(mockEmployee);
		mocks.getReportingChain.mockResolvedValue([]);
		mocks.getDirectReports.mockResolvedValue([]);

		renderPage();
		await waitFor(() => screen.getByText("Engineering"));
		expect(screen.getByRole("link", { name: /^edit$/i })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /^archive$/i }),
		).toBeInTheDocument();
	});

	it("hides Edit/Archive buttons without perms", async () => {
		mocks.can.mockReturnValue(false);
		mocks.retrieve.mockResolvedValue(mockEmployee);
		mocks.getReportingChain.mockResolvedValue([]);
		mocks.getDirectReports.mockResolvedValue([]);

		renderPage();
		await waitFor(() => screen.getByText("PVT-001"));
		expect(
			screen.queryByRole("link", { name: /^edit$/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /^archive$/i }),
		).not.toBeInTheDocument();
	});
});
