import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rename = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ roleApi: { rename } }));

import { RenameRoleDialog } from "./RenameRoleDialog";

const role = {
	code: "payroll_auditor",
	name: "Payroll Auditor",
	is_system: false,
	member_count: 1,
};

beforeEach(() => {
	rename.mockReset();
	rename.mockResolvedValue({ code: "payroll_auditor", name: "Renamed", permissions: [] });
});

describe("RenameRoleDialog", () => {
	it("saves the new name + description via roleApi.rename", async () => {
		const user = userEvent.setup();
		const onSaved = vi.fn();
		render(<RenameRoleDialog open onOpenChange={() => {}} role={role} onSaved={onSaved} />);
		const nameInput = screen.getByLabelText("Role name");
		await user.clear(nameInput);
		await user.type(nameInput, "Senior Auditor");
		await user.type(screen.getByLabelText("Role description"), "Audits payroll");
		await user.click(screen.getByRole("button", { name: /save/i }));
		expect(rename).toHaveBeenCalledWith("payroll_auditor", {
			name: "Senior Auditor",
			description: "Audits payroll",
		});
		expect(onSaved).toHaveBeenCalled();
	});
});
