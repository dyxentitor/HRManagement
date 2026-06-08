import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import * as authMod from "@/lib/auth";

import * as claimsApiMod from "../api";
import FinanceQueuePage from "./FinanceQueuePage";

describe("FinanceQueuePage route guard (v1.10.1 sweep Bug #7)", () => {
	it("shows the finance-required empty state when perm is missing", async () => {
		vi.spyOn(authMod, "useAuth").mockReturnValue({
			user: null,
			perms: new Set<string>(), // no claim:approve:finance
			roles: ["manager"],
			loading: false,
			mustChangePassword: false,
			login: vi.fn(),
			loginWithMFA: vi.fn(),
			logout: vi.fn(),
			refreshMe: vi.fn(),
			clearMustChangePassword: vi.fn(),
		});
		const apiSpy = vi
			.spyOn(claimsApiMod.claimsApi, "listFinanceQueue")
			.mockResolvedValue([]);

		render(
			<MemoryRouter>
				<FinanceQueuePage />
			</MemoryRouter>,
		);

		expect(
			await screen.findByText(/Finance access required/i),
		).toBeInTheDocument();
		// Critical: the API must NOT be hit when the user lacks the perm —
		// the v1.10.0 sweep showed an opaque "GET /api/v1/claims/?scope=finance-queue failed"
		// alert because we fetched anyway and rendered the network failure.
		expect(apiSpy).not.toHaveBeenCalled();
	});

	it("renders the queue when the finance perm is held", async () => {
		vi.spyOn(authMod, "useAuth").mockReturnValue({
			user: null,
			perms: new Set<string>(["claim:approve:finance"]),
			roles: ["finance"],
			loading: false,
			mustChangePassword: false,
			login: vi.fn(),
			loginWithMFA: vi.fn(),
			logout: vi.fn(),
			refreshMe: vi.fn(),
			clearMustChangePassword: vi.fn(),
		});
		vi.spyOn(claimsApiMod.claimsApi, "listFinanceQueue").mockResolvedValue([]);

		render(
			<MemoryRouter>
				<FinanceQueuePage />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.queryByText(/Finance access required/i),
			).not.toBeInTheDocument();
		});
		expect(
			screen.getByText(/No claims awaiting reimbursement\./i),
		).toBeInTheDocument();
	});
});
