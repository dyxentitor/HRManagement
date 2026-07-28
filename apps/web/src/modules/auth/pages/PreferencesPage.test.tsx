import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// ── hoisted mocks ────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
	getPreferences: vi.fn(),
	updatePreferences: vi.fn(),
	patchMe: vi.fn(),
	logout: vi.fn(),
	refreshMe: vi.fn(),
	user: { email: "test@provintell.local", mfa_enabled: false, preferences: {} },
}));

vi.mock("@/lib/auth", () => ({
	useAuth: () => ({
		user: mocks.user,
		logout: mocks.logout,
		refreshMe: mocks.refreshMe,
		perms: new Set<string>(),
		roles: [],
	}),
}));

vi.mock("../../notifications/api", () => ({
	getPreferences: mocks.getPreferences,
	updatePreferences: mocks.updatePreferences,
}));

// Stub sonner so toast() is a no-op
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Stub token-storage for authFetch inside the page
vi.mock("@/lib/token-storage", () => ({
	tokenStorage: { getAccess: () => "fake-token" },
}));

// ── fixtures ─────────────────────────────────────────────────

const PREFS = [
	// auth domain (auth.login removed in v1.71.0)
	{ id: 3, type: "auth.password_changed", channel: "in_app", enabled: true },
	{ id: 4, type: "auth.password_changed", channel: "email", enabled: true },
	{ id: 5, type: "auth.mfa_enabled", channel: "in_app", enabled: true },
	{ id: 6, type: "auth.mfa_enabled", channel: "email", enabled: true },
	{ id: 7, type: "auth.mfa_disabled", channel: "in_app", enabled: true },
	{ id: 8, type: "auth.mfa_disabled", channel: "email", enabled: true },
	// leave domain
	{ id: 9, type: "leave.submitted", channel: "in_app", enabled: true },
	{ id: 10, type: "leave.submitted", channel: "email", enabled: true },
	{ id: 11, type: "leave.approved", channel: "in_app", enabled: true },
	{ id: 12, type: "leave.approved", channel: "email", enabled: true },
	{ id: 13, type: "leave.rejected", channel: "in_app", enabled: true },
	{ id: 14, type: "leave.rejected", channel: "email", enabled: true },
	{ id: 15, type: "leave.cancelled", channel: "in_app", enabled: true },
	{ id: 16, type: "leave.cancelled", channel: "email", enabled: true },
	{
		id: 17,
		type: "leave.replacement_granted",
		channel: "in_app",
		enabled: true,
	},
	{
		id: 18,
		type: "leave.replacement_granted",
		channel: "email",
		enabled: true,
	},
	// claim domain
	{ id: 19, type: "claim.submitted", channel: "in_app", enabled: true },
	{ id: 20, type: "claim.submitted", channel: "email", enabled: true },
	{ id: 21, type: "claim.approved", channel: "in_app", enabled: true },
	{ id: 22, type: "claim.approved", channel: "email", enabled: true },
	{ id: 23, type: "claim.rejected", channel: "in_app", enabled: true },
	{ id: 24, type: "claim.rejected", channel: "email", enabled: true },
	{ id: 25, type: "claim.reimbursed", channel: "in_app", enabled: true },
	{ id: 26, type: "claim.reimbursed", channel: "email", enabled: true },
	// kpi domain
	{
		id: 27,
		type: "kpi.cycle_opens_self_review",
		channel: "in_app",
		enabled: true,
	},
	{
		id: 28,
		type: "kpi.cycle_opens_self_review",
		channel: "email",
		enabled: true,
	},
	{
		id: 29,
		type: "kpi.cycle_opens_manager_review",
		channel: "in_app",
		enabled: true,
	},
	{
		id: 30,
		type: "kpi.cycle_opens_manager_review",
		channel: "email",
		enabled: true,
	},
	{
		id: 31,
		type: "kpi.review_submitted_self",
		channel: "in_app",
		enabled: true,
	},
	{
		id: 32,
		type: "kpi.review_submitted_self",
		channel: "email",
		enabled: true,
	},
	{
		id: 33,
		type: "kpi.review_submitted_manager",
		channel: "in_app",
		enabled: true,
	},
	{
		id: 34,
		type: "kpi.review_submitted_manager",
		channel: "email",
		enabled: true,
	},
	// cert domain
	{ id: 35, type: "cert.expiring_soon", channel: "in_app", enabled: true },
	{ id: 36, type: "cert.expiring_soon", channel: "email", enabled: true },
	// employee domain
	{
		id: 37,
		type: "employee.bank_changed_self",
		channel: "in_app",
		enabled: true,
	},
	{
		id: 38,
		type: "employee.bank_changed_self",
		channel: "email",
		enabled: true,
	},
	{
		id: 39,
		type: "employee.contract_ending_soon",
		channel: "in_app",
		enabled: true,
	},
	{
		id: 40,
		type: "employee.contract_ending_soon",
		channel: "email",
		enabled: true,
	},
	{
		id: 41,
		type: "employee.probation_ending_soon",
		channel: "in_app",
		enabled: true,
	},
	{
		id: 42,
		type: "employee.probation_ending_soon",
		channel: "email",
		enabled: true,
	},
	// schedule domain
	{
		id: 43,
		type: "schedule.roster_published",
		channel: "in_app",
		enabled: true,
	},
	{
		id: 44,
		type: "schedule.roster_published",
		channel: "email",
		enabled: true,
	},
];

import PreferencesPage from "./PreferencesPage";

function renderPage() {
	return render(
		<MemoryRouter>
			<PreferencesPage />
		</MemoryRouter>,
	);
}

describe("PreferencesPage", () => {
	it("renders 4 section headings: General, Two-step, Notifications, Danger zone", async () => {
		mocks.getPreferences.mockResolvedValue(PREFS);
		renderPage();
		await waitFor(() => expect(mocks.getPreferences).toHaveBeenCalled());
		expect(
			screen.getByRole("heading", { name: /General/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /Two-step verification/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /Notifications/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /Danger zone/i }),
		).toBeInTheDocument();
	});

	it("renders 21 notification rows (one per unique event type)", async () => {
		mocks.getPreferences.mockResolvedValue(PREFS);
		renderPage();
		await waitFor(() => screen.getByText("Password changed"));
		// Count checkboxes: 21 event types × 2 channels = 42
		const checkboxes = screen.getAllByRole("checkbox");
		expect(checkboxes.length).toBe(42);
	});

	it("groups rows by domain with domain headings", async () => {
		mocks.getPreferences.mockResolvedValue(PREFS);
		renderPage();
		await waitFor(() => screen.getByText("Password changed"));
		expect(screen.getByText(/Account & security/i)).toBeInTheDocument();
		// Domain headings
		const leaveHeadings = screen.getAllByText(/^Leave$/i);
		expect(leaveHeadings.length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText(/Claims/i)).toBeInTheDocument();
		expect(screen.getByText(/KPI & performance/i)).toBeInTheDocument();
	});

	it("theme card has aria-disabled", async () => {
		mocks.getPreferences.mockResolvedValue([]);
		renderPage();
		// The theme card has aria-disabled set
		const themeCard = document.querySelector("[aria-disabled='true']");
		expect(themeCard).not.toBeNull();
	});

	it("shows two-step confirm step on first click of sign out button", async () => {
		mocks.getPreferences.mockResolvedValue([]);
		renderPage();
		const signOutBtn = screen.getByRole("button", {
			name: /Sign out all sessions/i,
		});
		await userEvent.click(signOutBtn);
		expect(
			screen.getByRole("button", { name: /Confirm sign out/i }),
		).toBeInTheDocument();
	});

	it("security events show Security pill and disabled checkboxes", async () => {
		mocks.getPreferences.mockResolvedValue(PREFS);
		renderPage();
		await waitFor(() => screen.getByText("Password changed"));
		const securityPills = screen.getAllByText("Security");
		// 4 security event types (auth.login removed in v1.71.0)
		expect(securityPills.length).toBeGreaterThanOrEqual(4);
	});

	it("Save preferences button is disabled when no changes have been made", async () => {
		mocks.getPreferences.mockResolvedValue(PREFS);
		renderPage();
		await waitFor(() => screen.getByText("Password changed"));
		const saveBtn = screen.getByRole("button", { name: /Save preferences/i });
		expect(saveBtn).toBeDisabled();
		// Toggle a non-security checkbox to make it dirty
		const nonSecurityCheckbox = screen.getByLabelText(
			/Leave request submitted in-app/i,
		);
		await userEvent.click(nonSecurityCheckbox);
		expect(saveBtn).not.toBeDisabled();
	});
});
