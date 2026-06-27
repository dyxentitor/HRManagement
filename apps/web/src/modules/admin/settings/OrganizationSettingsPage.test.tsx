import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OrganizationSettingsPage from "./OrganizationSettingsPage";
import { settingsApi } from "./settings-api";

const permMocks = vi.hoisted(() => ({ can: vi.fn(() => true) }));
vi.mock("@/lib/perm", () => ({ useCan: () => permMocks.can() }));

vi.mock("./settings-api", () => ({
	settingsApi: {
		getOrg: vi.fn(),
		patchOrg: vi.fn(),
		presignLogo: vi.fn(),
		registerLogo: vi.fn(),
		deleteLogo: vi.fn(),
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
	permMocks.can.mockReturnValue(true);
});

function mockOrg(overrides = {}) {
	(settingsApi.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue({
		id: "org-1",
		name: "Acme",
		slug: "acme",
		country_code: "MY",
		default_currency: "MYR",
		default_timezone: "Asia/Kuala_Lumpur",
		default_locale: "en-MY",
		settings: {},
		status: "active",
		logo_url: null,
		...overrides,
	});
}

describe("OrganizationSettingsPage", () => {
	it("shows a no-permission notice and skips the fetch without org:settings:read", async () => {
		permMocks.can.mockReturnValue(false);
		render(<OrganizationSettingsPage />);
		expect(await screen.findByText(/don't have permission/i)).toBeInTheDocument();
		expect(settingsApi.getOrg).not.toHaveBeenCalled();
	});

	it("renders form pre-filled from /org/settings", async () => {
		mockOrg();
		render(<OrganizationSettingsPage />);
		await waitFor(() => expect(screen.getByDisplayValue("Acme")).toBeInTheDocument());
		expect(screen.getByDisplayValue("MYR")).toBeInTheDocument();
	});

	it("PATCHes name on save", async () => {
		mockOrg();
		(settingsApi.patchOrg as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: "org-1",
			name: "Acme Rebrand",
			slug: "acme",
			country_code: "MY",
			default_currency: "MYR",
			default_timezone: "Asia/Kuala_Lumpur",
			default_locale: "en-MY",
			settings: {},
			status: "active",
			logo_url: null,
		});
		render(<OrganizationSettingsPage />);
		await waitFor(() => expect(screen.getByDisplayValue("Acme")).toBeInTheDocument());
		const nameInput = screen.getByLabelText(/display name/i);
		await userEvent.clear(nameInput);
		await userEvent.type(nameInput, "Acme Rebrand");
		await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
		await waitFor(() =>
			expect(settingsApi.patchOrg).toHaveBeenCalledWith(
				expect.objectContaining({ name: "Acme Rebrand" }),
			),
		);
	});

	it("shows the Employee Codes section and PATCHes the nested config on save", async () => {
		mockOrg({ settings: { employee_code: { prefix: "PVT" } } });
		(settingsApi.patchOrg as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: "org-1",
			name: "Acme",
			slug: "acme",
			country_code: "MY",
			default_currency: "MYR",
			default_timezone: "Asia/Kuala_Lumpur",
			default_locale: "en-MY",
			settings: { employee_code: { prefix: "ACME" } },
			status: "active",
			logo_url: null,
		});
		render(<OrganizationSettingsPage />);
		const input = await screen.findByLabelText(/employee code prefix/i);
		expect(input).toHaveValue("PVT");
		await userEvent.clear(input);
		await userEvent.type(input, "ACME");
		await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
		await waitFor(() =>
			expect(settingsApi.patchOrg).toHaveBeenCalledWith(
				expect.objectContaining({
					settings: expect.objectContaining({
						employee_code: expect.objectContaining({ prefix: "ACME" }),
					}),
				}),
			),
		);
	});

	it("renders logo image when logo_url is set", async () => {
		mockOrg({ logo_url: "https://minio/logo.webp" });
		render(<OrganizationSettingsPage />);
		await waitFor(() => expect(screen.getByRole("img", { name: /acme/i })).toBeInTheDocument());
	});

	it("calls deleteLogo on Remove click", async () => {
		mockOrg({ logo_url: "https://minio/logo.webp" });
		(settingsApi.deleteLogo as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		render(<OrganizationSettingsPage />);
		await waitFor(() => screen.getByRole("button", { name: /remove/i }));
		await userEvent.click(screen.getByRole("button", { name: /remove/i }));
		await waitFor(() => expect(settingsApi.deleteLogo).toHaveBeenCalled());
	});
});
