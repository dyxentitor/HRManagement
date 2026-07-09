import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrgLogo } from "./OrgLogo";

vi.mock("@/modules/admin/settings/settings-api", () => ({
	settingsApi: { getBranding: vi.fn() },
}));

import { settingsApi } from "@/modules/admin/settings/settings-api";

const branding = () => settingsApi.getBranding as ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("OrgLogo", () => {
	it("renders the uploaded wordmark in landscape mode", async () => {
		branding().mockResolvedValue({
			name: "Provintell",
			logo_url: "https://example/logo.webp",
			logo_mode: "landscape",
		});
		render(<OrgLogo />);
		const img = (await screen.findByRole("img", { name: /provintell/i })) as HTMLImageElement;
		expect(img.src).toBe("https://example/logo.webp");
	});

	it("falls back to the bundled /logo.png when there is no uploaded logo", async () => {
		branding().mockResolvedValue({ name: "Provintell", logo_url: null, logo_mode: "landscape" });
		render(<OrgLogo />);
		const img = (await screen.findByRole("img")) as HTMLImageElement;
		expect(img.src).toMatch(/\/logo\.png$/);
	});

	it("renders the uppercase name lockup in legacy mode", async () => {
		branding().mockResolvedValue({ name: "Acme Corp", logo_url: null, logo_mode: "legacy" });
		render(<OrgLogo />);
		await waitFor(() => expect(screen.getByText("ACME CORP")).toBeInTheDocument());
		expect(screen.queryByRole("img")).not.toBeInTheDocument();
	});

	it("falls back to the default logo image on fetch error", async () => {
		branding().mockRejectedValue(new Error("network"));
		render(<OrgLogo />);
		const img = (await screen.findByRole("img")) as HTMLImageElement;
		expect(img.src).toMatch(/\/logo\.png$/);
	});
});
