import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SignedOutGate } from "./SignedOutGate";

const authState: {
	user: unknown;
	loading: boolean;
	mustChangePassword: boolean;
} = {
	user: null,
	loading: false,
	mustChangePassword: false,
};

vi.mock("@/lib/auth", () => ({
	useAuth: () => authState,
}));

function renderAt(path: string) {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route
					path="/login"
					element={<p>login-page</p>}
				/>
				<Route
					path="/force-password-change"
					element={<p>force-change-page</p>}
				/>
				<Route
					path="*"
					element={
						<SignedOutGate>
							<p>protected-content</p>
						</SignedOutGate>
					}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("SignedOutGate", () => {
	it("redirects to /login when no user", () => {
		authState.user = null;
		authState.loading = false;
		authState.mustChangePassword = false;
		renderAt("/employees");
		expect(screen.getByText("login-page")).toBeInTheDocument();
	});

	it("redirects to /force-password-change when mustChangePassword is true", () => {
		authState.user = { email: "x@y.z" };
		authState.loading = false;
		authState.mustChangePassword = true;
		renderAt("/employees");
		expect(screen.getByText("force-change-page")).toBeInTheDocument();
	});

	it("renders children when authed and password is fine", () => {
		authState.user = { email: "x@y.z" };
		authState.loading = false;
		authState.mustChangePassword = false;
		renderAt("/employees");
		expect(screen.getByText("protected-content")).toBeInTheDocument();
	});
});
