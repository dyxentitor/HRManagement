import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DepartmentsAdminPage from "./DepartmentsAdminPage";
import { settingsApi } from "./settings-api";

vi.mock("./settings-api", () => ({
	settingsApi: {
		listDepartments: vi.fn(),
		createDepartment: vi.fn(),
		updateDepartment: vi.fn(),
		deleteDepartment: vi.fn(),
	},
	unwrapResults: <T,>(b: T[] | { results: T[] }): T[] =>
		Array.isArray(b) ? b : b.results ?? [],
}));

beforeEach(() => {
	vi.clearAllMocks();
	(settingsApi.listDepartments as ReturnType<typeof vi.fn>).mockResolvedValue([
		{ id: "d1", name: "Engineering", parent: null, head_employee_id: null },
		{ id: "d2", name: "Cybersecurity", parent: "d1", head_employee_id: null },
		{ id: "d3", name: "HR", parent: null, head_employee_id: null },
	]);
});

describe("DepartmentsAdminPage", () => {
	it("renders departments in hierarchy", async () => {
		render(<DepartmentsAdminPage />);
		await waitFor(() => screen.getByText("Engineering"));
		expect(screen.getByText("Cybersecurity")).toBeInTheDocument();
		expect(screen.getByText("HR")).toBeInTheDocument();
	});

	it("opens create modal when New Department clicked", async () => {
		render(<DepartmentsAdminPage />);
		await waitFor(() => screen.getByText("Engineering"));
		await userEvent.click(
			screen.getByRole("button", { name: /new department/i }),
		);
		expect(
			screen.getByRole("heading", { name: /new department/i }),
		).toBeInTheDocument();
	});

	it("POSTs on save", async () => {
		(
			settingsApi.createDepartment as ReturnType<typeof vi.fn>
		).mockResolvedValue({ id: "new", name: "Sales", parent: null });
		render(<DepartmentsAdminPage />);
		await waitFor(() => screen.getByText("Engineering"));
		await userEvent.click(
			screen.getByRole("button", { name: /new department/i }),
		);
		await userEvent.type(screen.getByLabelText(/^name$/i), "Sales");
		await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
		await waitFor(() =>
			expect(settingsApi.createDepartment).toHaveBeenCalledWith({
				name: "Sales",
				parent: null,
			}),
		);
	});

	it("shows error on delete failure (e.g., active employees)", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		(
			settingsApi.deleteDepartment as ReturnType<typeof vi.fn>
		).mockRejectedValue(
			new Error(
				'{"detail":"Department has active employees; reassign before deleting."}',
			),
		);
		render(<DepartmentsAdminPage />);
		await waitFor(() => screen.getByText("Engineering"));
		await userEvent.click(screen.getByLabelText(/delete engineering/i));
		await waitFor(() =>
			expect(screen.getByRole("alert")).toHaveTextContent(/reassign/i),
		);
		confirmSpy.mockRestore();
	});
});
