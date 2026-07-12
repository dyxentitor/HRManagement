import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

// Matches only <span> group-label elements whose text equals `label`.
// Domain labels render inside a <span class="text-label">; the UserMenu also renders
// text in spans, so we match on exact textContent to avoid false positives.
function getGroupLabel(label: string): HTMLElement | null {
	return screen.queryByText((_, element) => {
		return element?.tagName === "SPAN" && element.textContent === label;
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
		perms: mocks.perms,
	}),
}));
vi.mock("@/lib/feature-flags", () => ({
	useFeature: (key: string) => mocks.flags[key] !== false,
}));
// Keep the sidebar network-free in tests; badge counts are exercised elsewhere.
vi.mock("@/lib/nav-badges", () => ({
	useNavBadges: () => ({}),
}));

describe("Sidebar", () => {
	it("always shows Dashboard and My Profile (zero-perm items)", () => {
		mocks.perms = new Set();
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /my profile/i })).toBeInTheDocument();
	});

	it("hides items the user can't access", () => {
		mocks.perms = new Set();
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(screen.queryByRole("link", { name: /payroll/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("link", { name: /approvals/i })).not.toBeInTheDocument();
	});

	it("hides a domain group when none of its items are visible", () => {
		mocks.perms = new Set();
		mocks.flags = {};
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		// With no perms, Money (all items gated) is hidden; People still shows via My Profile.
		expect(getGroupLabel("Money")).not.toBeInTheDocument();
		expect(getGroupLabel("People")).toBeInTheDocument();
	});

	it("shows the Employee directory under People with employee:read:org", () => {
		mocks.perms = new Set(["employee:read:org"]);
		mocks.flags = {};
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(getGroupLabel("People")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /directory/i })).toBeInTheDocument();
		// Admin group only appears with role:read, not a directory read perm.
		expect(getGroupLabel("Admin")).not.toBeInTheDocument();
	});

	it("shows the Admin group with role:read (Settings)", () => {
		mocks.perms = new Set(["role:read"]);
		mocks.flags = {};
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(getGroupLabel("Admin")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /^settings$/i })).toBeInTheDocument();
	});

	it("shows Assignments once for read:org and once for create:team (anyPerm, no duplicate)", () => {
		for (const perm of ["assignment:read:org", "assignment:create:team"]) {
			mocks.perms = new Set([perm]);
			mocks.flags = {};
			const { unmount } = render(
				<MemoryRouter>
					<Sidebar />
				</MemoryRouter>,
			);
			expect(screen.getAllByRole("link", { name: /^assignments$/i })).toHaveLength(1);
			unmount();
		}
	});

	it("hides Payroll when the payslip feature flag is disabled, even if perm is granted", () => {
		// Payroll endpoints are gated by @requires_feature("payslip") on the backend;
		// the sidebar item uses the same key so it hides in lockstep.
		mocks.perms = new Set(["payroll:run:create"]);
		mocks.flags = { payslip: false };
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(screen.queryByRole("link", { name: /payroll/i })).not.toBeInTheDocument();
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

	it("hides Settings link without role:read perm", () => {
		mocks.perms = new Set(["employee:read:org"]);
		mocks.flags = {};
		render(
			<MemoryRouter>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(screen.queryByRole("link", { name: /^settings$/i })).not.toBeInTheDocument();
	});

	it("marks only Feedback Management active on /feedback/manage (parent path not prefix-highlighted)", () => {
		mocks.perms = new Set(["feedback:submit:self", "feedback:manage:org"]);
		mocks.flags = {};
		render(
			<MemoryRouter initialEntries={["/feedback/manage"]}>
				<Sidebar />
			</MemoryRouter>,
		);
		const feedback = screen.getByRole("link", { name: /^feedback$/i });
		const management = screen.getByRole("link", { name: /feedback management/i });
		// NavLink sets aria-current="page" on the active link.
		expect(management).toHaveAttribute("aria-current", "page");
		expect(feedback).not.toHaveAttribute("aria-current", "page");
	});

	it("marks Feedback active on /feedback", () => {
		mocks.perms = new Set(["feedback:submit:self", "feedback:manage:org"]);
		mocks.flags = {};
		render(
			<MemoryRouter initialEntries={["/feedback"]}>
				<Sidebar />
			</MemoryRouter>,
		);
		expect(screen.getByRole("link", { name: /^feedback$/i })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});
});
