import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { UserMenu } from "./UserMenu";

const mocks = vi.hoisted(() => ({
	logout: vi.fn(),
	user: { email: "admin@provintell.demo" },
	roles: ["org_admin"],
}));

vi.mock("@/lib/auth", () => ({
	useAuth: () => ({
		user: mocks.user,
		logout: mocks.logout,
		roles: mocks.roles,
	}),
}));

describe("UserMenu", () => {
	it("renders the trigger with user initial", () => {
		render(
			<MemoryRouter>
				<UserMenu />
			</MemoryRouter>,
		);
		expect(
			screen.getByRole("button", { name: /account menu/i }),
		).toBeInTheDocument();
	});

	it("opens dropdown with profile / preferences / sign-out items", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<UserMenu />
			</MemoryRouter>,
		);
		await user.click(screen.getByRole("button", { name: /account menu/i }));
		expect(
			screen.getByRole("menuitem", { name: /profile/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("menuitem", { name: /preferences/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("menuitem", { name: /sign out/i }),
		).toBeInTheDocument();
	});

	it("calls logout on sign-out click", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<UserMenu />
			</MemoryRouter>,
		);
		await user.click(screen.getByRole("button", { name: /account menu/i }));
		await user.click(screen.getByRole("menuitem", { name: /sign out/i }));
		expect(mocks.logout).toHaveBeenCalled();
	});
});
