import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrgLogo } from "./OrgLogo";

vi.mock("@/modules/admin/settings/settings-api", () => ({
	settingsApi: { getOrg: vi.fn() },
}));

import { settingsApi } from "@/modules/admin/settings/settings-api";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("OrgLogo", () => {
	it("renders the logo image when logo_url is set", async () => {
		(settingsApi.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue({
			name: "Provintell",
			logo_url: "https://example/logo.webp",
		});
		render(<OrgLogo />);
		const img = (await screen.findByRole("img", {
			name: /provintell/i,
		})) as HTMLImageElement;
		expect(img.src).toBe("https://example/logo.webp");
	});

	it("falls back to text + gradient square when logo_url is null", async () => {
		(settingsApi.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue({
			name: "Provintell",
			logo_url: null,
		});
		render(<OrgLogo />);
		await waitFor(() =>
			expect(screen.getByText("PROVINTELL")).toBeInTheDocument(),
		);
		expect(screen.queryByRole("img")).not.toBeInTheDocument();
	});

	it("falls back to PROVINTELL text on fetch error", async () => {
		(settingsApi.getOrg as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error("network"),
		);
		render(<OrgLogo />);
		await waitFor(() =>
			expect(screen.getByText("PROVINTELL")).toBeInTheDocument(),
		);
	});
});
