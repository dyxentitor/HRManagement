import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

const mocks = vi.hoisted(() => ({
	perms: new Set<string>(),
	user: { email: "admin@provintell.demo" } as { email: string } | null,
	roles: ["org_admin"],
	logout: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
	useAuth: () => ({
		user: mocks.user,
		logout: mocks.logout,
		roles: mocks.roles,
	}),
}));
vi.mock("@/lib/perm", () => ({
	useCan: (perm: string) => mocks.perms.has(perm),
}));

describe("Sidebar", () => {
	it("always shows Dashboard and My Profile (zero-perm items)", () => {
		mocks.perms = new Set();
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(
			screen.getByRole("link", { name: /dashboard/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /my profile/i }),
		).toBeInTheDocument();
	});

	it("hides items the user can't access", () => {
		mocks.perms = new Set();
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(
			screen.queryByRole("link", { name: /payroll/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: /approvals/i }),
		).not.toBeInTheDocument();
	});

	it("hides the Team group when no team items are visible", () => {
		mocks.perms = new Set();
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(screen.queryByText(/^team$/i)).not.toBeInTheDocument();
	});

	it("shows the Admin group when an admin perm is granted", () => {
		mocks.perms = new Set(["employee:read:org"]);
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(screen.getByText(/^admin$/i)).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /employees/i }),
		).toBeInTheDocument();
	});
});
