import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const empList = vi.hoisted(() => vi.fn());
vi.mock("@/modules/employee/api", () => ({ employeeApi: { list: empList } }));
const add = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({
	roleMembersApi: { add, remove },
	userAccessApi: { effective: vi.fn() },
}));

import { type RoleMember } from "../api";
import { RoleMembersTab } from "./RoleMembersTab";

const members: RoleMember[] = [
	{
		user_id: "u1",
		employee_id: "e1",
		name: "Nur Hidayah",
		email: "nur@x.com",
		roles: [
			{ code: "viewer", name: "Viewer" },
			{ code: "employee", name: "Employee" },
		],
	},
];

beforeEach(() => {
	empList.mockResolvedValue([]);
	add.mockReset();
	remove.mockReset();
});

describe("RoleMembersTab", () => {
	it("shows each member's other roles as chips", async () => {
		render(<RoleMembersTab roleCode="viewer" members={members} canWrite onChange={() => {}} />);
		await waitFor(() => expect(screen.getByText("Nur Hidayah")).toBeInTheDocument());
		expect(screen.getByText("also:")).toBeInTheDocument();
		expect(screen.getByText("Employee")).toBeInTheDocument(); // the other role
		expect(screen.queryByText("Viewer")).not.toBeInTheDocument(); // current role excluded
	});

	it("warns before removing a member's only role", async () => {
		const solo: RoleMember[] = [{ ...members[0], roles: [{ code: "viewer", name: "Viewer" }] }];
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		const user = userEvent.setup();
		render(<RoleMembersTab roleCode="viewer" members={solo} canWrite onChange={() => {}} />);
		await waitFor(() => expect(screen.getByText("Nur Hidayah")).toBeInTheDocument());
		await user.click(screen.getByRole("button", { name: /remove nur/i }));
		expect(confirmSpy).toHaveBeenCalled();
		expect(remove).not.toHaveBeenCalled(); // declined → no removal
		confirmSpy.mockRestore();
	});
});
