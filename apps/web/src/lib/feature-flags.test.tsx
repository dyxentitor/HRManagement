import { featureFlagApi } from "@/modules/admin/api";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider, RequireFeature, useFeature } from "./feature-flags";

vi.mock("@/lib/auth", () => ({
	useAuth: () => ({ user: { id: "u-1" }, perms: new Set<string>() }),
}));

vi.mock("@/lib/perm", () => ({
	useCan: () => false,
}));

vi.mock("@/modules/admin/api", () => ({
	featureFlagApi: { list: vi.fn() },
}));

beforeEach(() => {
	vi.clearAllMocks();
});

function Probe({ key_ }: { key_: string }) {
	const enabled = useFeature(key_);
	return <div data-testid="probe">{enabled ? "on" : "off"}</div>;
}

describe("FeaturesProvider", () => {
	it("returns true while loading (optimistic)", async () => {
		(featureFlagApi.list as ReturnType<typeof vi.fn>).mockReturnValue(
			new Promise(() => {}), // never resolves
		);
		render(
			<FeaturesProvider>
				<Probe key_="leave" />
			</FeaturesProvider>,
		);
		expect(screen.getByTestId("probe").textContent).toBe("on");
	});

	it("reflects fetched state", async () => {
		(featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
			{
				key: "leave",
				label: "Leave",
				enabled: true,
				critical: false,
				togglable: true,
				derived: false,
				depends_on: [],
			},
			{
				key: "claims",
				label: "Claims",
				enabled: false,
				critical: false,
				togglable: true,
				derived: false,
				depends_on: [],
			},
		]);
		render(
			<FeaturesProvider>
				<Probe key_="claims" />
			</FeaturesProvider>,
		);
		await waitFor(() => {
			expect(screen.getByTestId("probe").textContent).toBe("off");
		});
	});

	it("treats unknown keys as enabled (optimistic)", async () => {
		(featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
		render(
			<FeaturesProvider>
				<Probe key_="totally-new" />
			</FeaturesProvider>,
		);
		await waitFor(() => {
			expect(screen.getByTestId("probe").textContent).toBe("on");
		});
	});
});

function ChildMarker() {
	return <div data-testid="child">child rendered</div>;
}

describe("RequireFeature", () => {
	it("renders children when the flag is enabled", async () => {
		(featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
			{
				key: "payslip",
				label: "Payslips",
				enabled: true,
				togglable: true,
				critical: false,
				derived: false,
				depends_on: [],
			},
		]);
		render(
			<MemoryRouter>
				<FeaturesProvider>
					<RequireFeature flag="payslip">
						<ChildMarker />
					</RequireFeature>
				</FeaturesProvider>
			</MemoryRouter>,
		);
		await waitFor(() => {
			expect(screen.getByTestId("child")).toBeInTheDocument();
		});
	});

	it("renders ModuleDisabled when the flag is explicitly disabled", async () => {
		(featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
			{
				key: "payslip",
				label: "Payslips",
				enabled: false,
				togglable: true,
				critical: false,
				derived: false,
				depends_on: [],
			},
		]);
		render(
			<MemoryRouter>
				<FeaturesProvider>
					<RequireFeature flag="payslip">
						<ChildMarker />
					</RequireFeature>
				</FeaturesProvider>
			</MemoryRouter>,
		);
		await waitFor(() => {
			expect(
				screen.getByText(/Payslips is currently disabled/i),
			).toBeInTheDocument();
		});
		expect(screen.queryByTestId("child")).not.toBeInTheDocument();
	});

	it("renders children optimistically while flags are loading", () => {
		(featureFlagApi.list as ReturnType<typeof vi.fn>).mockReturnValue(
			new Promise(() => {}),
		);
		render(
			<MemoryRouter>
				<FeaturesProvider>
					<RequireFeature flag="payslip">
						<ChildMarker />
					</RequireFeature>
				</FeaturesProvider>
			</MemoryRouter>,
		);
		expect(screen.getByTestId("child")).toBeInTheDocument();
	});

	it("renders children when the flag is missing from the loaded map", async () => {
		(featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
		render(
			<MemoryRouter>
				<FeaturesProvider>
					<RequireFeature flag="totally-new">
						<ChildMarker />
					</RequireFeature>
				</FeaturesProvider>
			</MemoryRouter>,
		);
		await waitFor(() => {
			expect(screen.getByTestId("child")).toBeInTheDocument();
		});
	});
});
