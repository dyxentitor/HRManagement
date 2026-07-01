import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CatalogueModule } from "../api";
import { PermissionAccordion } from "./PermissionAccordion";

const modules: CatalogueModule[] = [
	{
		key: "people",
		label: "People",
		icon: "Users",
		granted_count: 1,
		total: 2,
		permissions: [
			{
				code: "employee:read:org",
				label: "View employees",
				description: "See the directory",
				scope: "org",
				requires: [],
				dangerous: false,
				granted: true,
			},
			{
				code: "employee:write:org",
				label: "Edit employees",
				description: "Change profiles",
				scope: "org",
				requires: [],
				dangerous: false,
				granted: false,
			},
		],
	},
];

function setup(props: Partial<React.ComponentProps<typeof PermissionAccordion>> = {}) {
	const onToggle = vi.fn();
	render(
		<PermissionAccordion
			modules={modules}
			draft={new Set(["employee:read:org"])}
			editable
			onToggle={onToggle}
			search=""
			grantedOnly={false}
			{...props}
		/>,
	);
	return { onToggle };
}

describe("PermissionAccordion", () => {
	it("P0: renders a permission the role does NOT have, and grants it", async () => {
		const user = userEvent.setup();
		const { onToggle } = setup();
		// expand the module
		await user.click(screen.getByRole("button", { name: /People/ }));
		// the NOT-granted permission is visible — this is the bug that's fixed
		const ungranted = screen.getByText("Edit employees");
		expect(ungranted).toBeInTheDocument();
		// toggling it on calls onToggle(code, true)
		const row = ungranted.closest("label");
		const checkbox = row?.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(checkbox.checked).toBe(false);
		await user.click(checkbox);
		expect(onToggle).toHaveBeenCalledWith("employee:write:org", true);
	});

	it("granted-only filter hides ungranted permissions", () => {
		setup({ grantedOnly: true, search: "employees" });
		expect(screen.getByText("View employees")).toBeInTheDocument();
		expect(screen.queryByText("Edit employees")).not.toBeInTheDocument();
	});

	it("search matches by code, label, or description", () => {
		setup({ search: "directory" });
		expect(screen.getByText("View employees")).toBeInTheDocument();
		expect(screen.queryByText("Edit employees")).not.toBeInTheDocument();
	});
});
