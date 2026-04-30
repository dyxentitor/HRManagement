import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { featureFlagApi } from "../api";
import AdminModulesPage from "./AdminModulesPage";

vi.mock("../api", () => ({
	featureFlagApi: { list: vi.fn(), setEnabled: vi.fn() },
}));

vi.mock("@/lib/feature-flags", () => ({
	useFeaturesRefresh: () => vi.fn(),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

const renderPage = () =>
	render(
		<MemoryRouter>
			<AdminModulesPage />
		</MemoryRouter>,
	);

describe("AdminModulesPage", () => {
	it("renders togglable + critical + derived sections", async () => {
		(featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
			{
				key: "identity",
				label: "Identity",
				enabled: true,
				togglable: false,
				critical: true,
				derived: false,
			},
			{
				key: "leave",
				label: "Leave",
				enabled: true,
				togglable: true,
				critical: false,
				derived: false,
				depends_on: [],
			},
			{
				key: "claims",
				label: "Claims",
				enabled: false,
				togglable: true,
				critical: false,
				derived: false,
				depends_on: [],
			},
		]);
		renderPage();
		await waitFor(() => screen.getByText("Leave"));
		expect(screen.getByText(/required/i)).toBeInTheDocument();
	});

	it("toggling a module calls setEnabled and re-fetches", async () => {
		(featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValue([
			{
				key: "leave",
				label: "Leave",
				enabled: true,
				togglable: true,
				critical: false,
				derived: false,
				depends_on: [],
			},
		]);
		(
			featureFlagApi.setEnabled as ReturnType<typeof vi.fn>
		).mockResolvedValueOnce({
			key: "leave",
			label: "Leave",
			enabled: false,
			togglable: true,
			critical: false,
			derived: false,
			depends_on: [],
		});
		renderPage();
		await waitFor(() => screen.getByText("Leave"));

		const toggle = screen.getByRole("switch", { name: /leave/i });
		fireEvent.click(toggle);
		await waitFor(() =>
			expect(featureFlagApi.setEnabled).toHaveBeenCalledWith("leave", false),
		);
	});

	it("does not render a switch for critical modules", async () => {
		(featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
			{
				key: "identity",
				label: "Identity",
				enabled: true,
				togglable: false,
				critical: true,
				derived: false,
			},
		]);
		renderPage();
		await waitFor(() => screen.getByText(/identity/i));
		expect(screen.queryByRole("switch", { name: /identity/i })).toBeNull();
	});
});
