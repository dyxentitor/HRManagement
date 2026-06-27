import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	perms: new Set<string>(["employee:write:org", "employee:bank:read", "employee:bank:write"]),
	nextCode: vi.fn(),
}));
vi.mock("@/lib/perm", () => ({
	useCan: (p: string) => (p === "" ? false : mocks.perms.has(p)),
}));
// EmployeeCodeField pre-fills via employeeApi.nextCode on create-mount; default to ""
// so the existing tests keep typing their own codes into an empty field.
vi.mock("@/modules/employee/api", () => ({ employeeApi: { nextCode: mocks.nextCode } }));

import { EmployeeForm } from "./EmployeeForm";

const defaultProps = {
	mode: "create" as const,
	initial: null,
	departments: [{ id: "d1", name: "Operations" }],
	teams: [{ id: "t1", name: "Focus" }],
	managerOptions: [{ id: "e9", full_name: "Boss" }],
	onSubmit: vi.fn(),
	onCancel: vi.fn(),
};

beforeEach(() => {
	mocks.perms = new Set(["employee:write:org", "employee:bank:read", "employee:bank:write"]);
	defaultProps.onSubmit.mockReset();
	mocks.nextCode.mockReset().mockResolvedValue("");
});

describe("EmployeeForm", () => {
	it("pre-fills the employee code on a create form", async () => {
		mocks.nextCode.mockResolvedValue("EMP-2026-0007");
		render(<EmployeeForm {...defaultProps} />);
		await vi.waitFor(() =>
			expect(screen.getByLabelText(/^employee code$/i)).toHaveValue("EMP-2026-0007"),
		);
	});

	it("expands and collapses the employment section", async () => {
		const user = userEvent.setup();
		render(<EmployeeForm {...defaultProps} />);
		const toggle = screen.getByRole("button", {
			name: /^toggle employment$/i,
		});
		expect(screen.getByLabelText(/hire date/i)).toBeInTheDocument();
		await user.click(toggle);
		expect(screen.queryByLabelText(/hire date/i)).not.toBeInTheDocument();
	});

	it("starts optional sections collapsed in create mode", async () => {
		const user = userEvent.setup();
		render(<EmployeeForm {...defaultProps} />);
		// "personal" is collapsed by default in create mode → its fields hidden
		expect(screen.queryByLabelText(/date of birth/i)).not.toBeInTheDocument();
		const toggle = screen.getByRole("button", { name: /^toggle personal$/i });
		await user.click(toggle);
		expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument();
	});

	it("disables Save until required fields are present", () => {
		render(<EmployeeForm {...defaultProps} />);
		const save = screen.getByRole("button", { name: /^save$/i });
		expect(save).toBeDisabled();
	});

	it("enables Save with only the 7 required fields filled (create mode)", async () => {
		const user = userEvent.setup();
		render(<EmployeeForm {...defaultProps} />);
		// employment_type defaults to "fulltime" in the draft, so 6 to fill
		await user.type(screen.getByLabelText(/employee code/i), "E100");
		await user.type(screen.getByLabelText(/first name/i), "Ada");
		await user.type(screen.getByLabelText(/last name/i), "Lovelace");
		await user.type(screen.getByLabelText(/company email/i), "ada@example.com");
		await user.type(screen.getByLabelText(/hire date/i), "2026-01-01");
		await user.selectOptions(screen.getByLabelText(/department/i), "d1");

		const save = screen.getByRole("button", { name: /^save$/i });
		expect(save).toBeEnabled();
	});

	it("omits blank optional fields from the create payload", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(<EmployeeForm {...defaultProps} onSubmit={onSubmit} />);
		await user.type(screen.getByLabelText(/employee code/i), "E100");
		await user.type(screen.getByLabelText(/first name/i), "Ada");
		await user.type(screen.getByLabelText(/last name/i), "Lovelace");
		await user.type(screen.getByLabelText(/company email/i), "ada@example.com");
		await user.type(screen.getByLabelText(/hire date/i), "2026-01-01");
		await user.selectOptions(screen.getByLabelText(/department/i), "d1");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(onSubmit).toHaveBeenCalledTimes(1);
		const payload = onSubmit.mock.calls[0][0];
		// Blank optional date must NOT be sent as "" — DRF's DateField rejects it
		// with a 400 ("Date has wrong format"), the original cause of this bug.
		expect(payload.date_of_birth).toBeUndefined();
		expect(payload.gender).toBeUndefined();
		// Required + meaningful defaults are still present.
		expect(payload.employee_code).toBe("E100");
		expect(payload.employment_type).toBe("fulltime");
		expect(payload.department).toBe("d1");
	});

	it("marks required fields with an asterisk legend", () => {
		render(<EmployeeForm {...defaultProps} />);
		expect(screen.getByText(/are required/i)).toBeInTheDocument();
	});

	it("renders the manager picker", () => {
		render(<EmployeeForm {...defaultProps} />);
		expect(screen.getByLabelText(/manager/i)).toBeInTheDocument();
	});

	it("hides the Banking & Tax IDs section without employee:bank:read", () => {
		mocks.perms = new Set(["employee:write:org"]);
		render(<EmployeeForm {...defaultProps} />);
		expect(screen.queryByText(/banking & tax ids/i)).not.toBeInTheDocument();
	});

	it("provision section emits provision block on submit", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(
			<EmployeeForm
				{...defaultProps}
				canProvision
				roles={[{ code: "employee", name: "Employee" }]}
				onSubmit={onSubmit}
			/>,
		);
		await user.type(screen.getByLabelText(/employee code/i), "E100");
		await user.type(screen.getByLabelText(/first name/i), "Ada");
		await user.type(screen.getByLabelText(/last name/i), "Lovelace");
		await user.type(screen.getByLabelText(/company email/i), "ada@example.com");
		await user.type(screen.getByLabelText(/hire date/i), "2026-01-01");
		await user.selectOptions(screen.getByLabelText(/department/i), "d1");

		await user.click(screen.getByRole("switch", { name: /provision login account/i }));

		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(onSubmit).toHaveBeenCalledTimes(1);
		const payload = onSubmit.mock.calls[0][0];
		expect(payload.provision).toMatchObject({
			role_code: "employee",
			credential_method: "invite",
		});
	});

	it("hides the provision section when canProvision is false", () => {
		render(<EmployeeForm {...defaultProps} />);
		expect(
			screen.queryByRole("switch", { name: /provision login account/i }),
		).not.toBeInTheDocument();
	});

	it("shows the temp password field when credential method is temp", async () => {
		const user = userEvent.setup();
		render(
			<EmployeeForm
				{...defaultProps}
				canProvision
				roles={[{ code: "employee", name: "Employee" }]}
			/>,
		);
		await user.click(screen.getByRole("switch", { name: /provision login account/i }));
		expect(screen.queryByLabelText(/temporary password/i)).not.toBeInTheDocument();
		await user.selectOptions(screen.getByLabelText(/credential method/i), "temp");
		expect(screen.getByLabelText(/temporary password/i)).toBeInTheDocument();
	});
});
