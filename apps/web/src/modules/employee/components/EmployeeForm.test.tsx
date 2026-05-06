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
	it("collapses and expands sections", async () => {
		const user = userEvent.setup();
		render(<EmployeeForm {...defaultProps} />);
		const toggle = screen.getByRole("button", { name: /^toggle personal$/i });
		expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument();
		await user.click(toggle);
		expect(screen.queryByLabelText(/date of birth/i)).not.toBeInTheDocument();
	});

	it("disables Save until required fields are present", () => {
		render(<EmployeeForm {...defaultProps} />);
		const save = screen.getByRole("button", { name: /^save$/i });
		expect(save).toBeDisabled();
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
