import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	perms: new Set<string>([
		"employee:write:org",
		"employee:bank:read",
		"employee:bank:write",
	]),
}));
vi.mock("@/lib/perm", () => ({
	useCan: (p: string) => (p === "" ? false : mocks.perms.has(p)),
}));

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
	mocks.perms = new Set([
		"employee:write:org",
		"employee:bank:read",
		"employee:bank:write",
	]);
	defaultProps.onSubmit.mockReset();
});

describe("EmployeeForm", () => {
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
		await user.type(screen.getByLabelText(/email/i), "ada@example.com");
		await user.type(screen.getByLabelText(/hire date/i), "2026-01-01");
		await user.selectOptions(screen.getByLabelText(/department/i), "d1");

		const save = screen.getByRole("button", { name: /^save$/i });
		expect(save).toBeEnabled();
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
});
