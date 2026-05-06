import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ModuleDisabled } from "./ModuleDisabled";

const mocks = vi.hoisted(() => ({
	canFlag: false,
}));

vi.mock("@/lib/perm", () => ({
	useCan: (perm: string) =>
		perm === "org:feature_flag:write" ? mocks.canFlag : false,
}));

describe("ModuleDisabled", () => {
	it("renders the module label for a known key", () => {
		mocks.canFlag = false;
		render(
			<MemoryRouter>
				<ModuleDisabled module="payslip" />
			</MemoryRouter>,
		);
		expect(
			screen.getByText(/Payslips is currently disabled/i),
		).toBeInTheDocument();
	});

	it("falls back to the key for an unknown module", () => {
		mocks.canFlag = false;
		render(
			<MemoryRouter>
				<ModuleDisabled module="not-a-real-key" />
			</MemoryRouter>,
		);
		expect(
			screen.getByText(/not-a-real-key is currently disabled/i),
		).toBeInTheDocument();
	});

	it("hides the Enable CTA when the user lacks org:feature_flag:write", () => {
		mocks.canFlag = false;
		render(
			<MemoryRouter>
				<ModuleDisabled module="payslip" />
			</MemoryRouter>,
		);
		expect(
			screen.queryByRole("link", { name: /enable/i }),
		).not.toBeInTheDocument();
	});

	it("shows the Enable CTA pointing to /admin/modules?focus=<module> when allowed", () => {
		mocks.canFlag = true;
		render(
			<MemoryRouter>
				<ModuleDisabled module="payslip" />
			</MemoryRouter>,
		);
		const link = screen.getByRole("link", { name: /enable payslips/i });
		expect(link).toHaveAttribute("href", "/admin/modules?focus=payslip");
	});
});
