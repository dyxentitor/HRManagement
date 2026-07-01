import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
const clone = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ roleApi: { create, clone } }));

import { RoleFormModal } from "./RoleFormModal";

const roles = [
	{ code: "hr_manager", name: "HR Manager", is_system: true, member_count: 2 },
	{ code: "manager", name: "Manager", is_system: true, member_count: 5 },
];

beforeEach(() => {
	create.mockReset();
	clone.mockReset();
	create.mockResolvedValue({ code: "new_role", name: "New Role", permissions: [] });
	clone.mockResolvedValue({ code: "copy", name: "Copy", permissions: [] });
});

describe("RoleFormModal", () => {
	it("creates an empty role from name + description", async () => {
		const user = userEvent.setup();
		const onCreated = vi.fn();
		render(<RoleFormModal open onOpenChange={() => {}} roles={roles} onCreated={onCreated} />);
		await user.type(screen.getByLabelText("Role name"), "Payroll Auditor");
		await user.type(screen.getByLabelText("Role description"), "Reviews payroll");
		await user.click(screen.getByRole("button", { name: /create role/i }));
		expect(create).toHaveBeenCalledWith("Payroll Auditor", "Reviews payroll");
		expect(onCreated).toHaveBeenCalled();
	});

	it("clones from the selected source when in clone mode", async () => {
		const user = userEvent.setup();
		render(
			<RoleFormModal
				open
				onOpenChange={() => {}}
				roles={roles}
				initialMode="clone"
				initialSource="manager"
				onCreated={() => {}}
			/>,
		);
		await user.type(screen.getByLabelText("Role name"), "Manager Copy");
		await user.click(screen.getByRole("button", { name: /create role/i }));
		expect(clone).toHaveBeenCalledWith("manager", "Manager Copy", "");
	});

	it("blocks submit with an empty name", async () => {
		const user = userEvent.setup();
		render(<RoleFormModal open onOpenChange={() => {}} roles={roles} onCreated={() => {}} />);
		await user.click(screen.getByRole("button", { name: /create role/i }));
		expect(create).not.toHaveBeenCalled();
		expect(screen.getByText("Name is required.")).toBeInTheDocument();
	});
});
