import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

// Matches only <div> elements whose full text content equals `label`.
// Group labels are rendered as <div>s; the UserMenu renders the username in a <span>,
// so this prevents false positives when the username matches a group label (e.g. "admin").
function getGroupLabel(label: string): HTMLElement | null {
	return screen.queryByText((_, element) => {
		return element?.tagName === "DIV" && element.textContent === label;
	});
}

const mocks = vi.hoisted(() => ({
	perms: new Set<string>(),
	user: { email: "admin@provintell.demo" } as { email: string } | null,
	roles: ["org_admin"],
	logout: vi.fn(),
	flags: {} as Record<string, boolean>, // missing key = enabled (matches useFeature behavior)
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
vi.mock("@/lib/feature-flags", () => ({
	useFeature: (key: string) => mocks.flags[key] !== false,
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
		expect(getGroupLabel("Team")).not.toBeInTheDocument();
	});

	it("shows the Admin group when an admin perm is granted", () => {
		mocks.perms = new Set(["employee:read:org"]);
		mocks.flags = {};
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(getGroupLabel("Admin")).toBeInTheDocument();
		// the Employees directory now lives under the People hub
		expect(screen.getByRole("link", { name: /people/i })).toBeInTheDocument();
	});

	it("hides Payroll when the payslip feature flag is disabled, even if perm is granted", () => {
		// Payroll endpoints are gated by @requires_feature("payslip") on the
		// backend (PayrollPeriodViewSet, PayrollRunViewSet). The sidebar item
		// must use the same key so it hides in lockstep.
		mocks.perms = new Set(["payroll:run:create"]);
		mocks.flags = { payslip: false };
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(
			screen.queryByRole("link", { name: /payroll/i }),
		).not.toBeInTheDocument();
	});

	it("shows Payroll when the payslip feature flag is enabled and perm is granted", () => {
		mocks.perms = new Set(["payroll:run:create"]);
		mocks.flags = { payslip: true };
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(screen.getByRole("link", { name: /payroll/i })).toBeInTheDocument();
	});

	it("shows Settings link with role:read perm (v1.9.0: admin pages collapsed)", () => {
		mocks.perms = new Set(["role:read"]);
		mocks.flags = {};
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(
			screen.getByRole("link", { name: /^settings$/i }),
		).toBeInTheDocument();
	});

	it("hides Settings link without role:read perm", () => {
		mocks.perms = new Set(["employee:read:org"]);
		mocks.flags = {};
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(
			screen.queryByRole("link", { name: /^settings$/i }),
		).not.toBeInTheDocument();
	});
});
