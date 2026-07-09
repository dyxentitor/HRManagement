import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("@/lib/auth", () => ({
	useAuth: () => ({
		user: { email: "admin@provintell.demo" },
		logout: vi.fn(),
		roles: ["org_admin"],
	}),
}));
vi.mock("@/lib/perm", () => ({
	useCan: () => true,
}));
vi.mock("../SignedOutGate", () => ({
	SignedOutGate: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

describe("AppShell", () => {
	it("renders sidebar, topbar, and an outlet route", () => {
		render(
			<MemoryRouter initialEntries={["/employees"]}>
				<Routes>
					<Route element={<AppShell />}>
						<Route
							path="/employees"
							element={<p>employees-route-rendered</p>}
						/>
					</Route>
				</Routes>
			</MemoryRouter>,
		);
		// OrgLogo renders the landscape wordmark image by default (org branding loads async).
		expect(screen.getByRole("img", { name: /provintell/i })).toBeInTheDocument();
		expect(screen.getByText("employees-route-rendered")).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /skip to main content/i }),
		).toBeInTheDocument();
	});
});
