import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const perm = vi.hoisted(() => ({ can: vi.fn() }));
vi.mock("@/lib/perm", () => ({ useCan: (p: string) => perm.can(p) }));
vi.mock("../settings/settings-api", () => ({
	settingsApi: { overview: () => Promise.resolve({ attention: { unlinked_users_count: 0 } }) },
}));

import { PeopleNav } from "./PeopleNav";

function renderNav() {
	render(
		<MemoryRouter>
			<PeopleNav />
		</MemoryRouter>,
	);
}

describe("PeopleNav", () => {
	it("shows Directory, Invitations and Accounts when permitted", () => {
		perm.can.mockReturnValue(true);
		renderNav();
		expect(screen.getByText("People")).toBeInTheDocument();
		expect(screen.getByText("Directory")).toBeInTheDocument();
		expect(screen.getByText("Invitations")).toBeInTheDocument();
		expect(screen.getByText("Accounts")).toBeInTheDocument();
	});

	it("hides items the user lacks permission for", () => {
		// allow only employee:read:org (Directory); deny the rest
		perm.can.mockImplementation((p: string) => p === "employee:read:org");
		renderNav();
		expect(screen.getByText("Directory")).toBeInTheDocument();
		expect(screen.queryByText("Invitations")).not.toBeInTheDocument();
		expect(screen.queryByText("Accounts")).not.toBeInTheDocument();
	});
});
