import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const effective = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ userAccessApi: { effective } }));

import { EffectiveAccessDrawer } from "./EffectiveAccessDrawer";

beforeEach(() => {
	effective.mockReset();
	effective.mockResolvedValue({
		roles: [
			{ code: "hr", name: "HR Manager" },
			{ code: "manager", name: "Manager" },
		],
		modules: [
			{
				key: "people",
				label: "People",
				permissions: [
					{
						code: "employee:read:org",
						label: "View employees",
						scope: "org",
						dangerous: false,
						sources: ["hr", "manager"],
					},
				],
			},
		],
	});
});

describe("EffectiveAccessDrawer", () => {
	it("shows the person's roles and each permission's source roles", async () => {
		render(<EffectiveAccessDrawer userId="u1" name="Tan Wei" onClose={() => {}} />);
		await waitFor(() => expect(screen.getByText("View employees")).toBeInTheDocument());
		expect(screen.getByText("Tan Wei")).toBeInTheDocument();
		// the shared permission shows both source roles — the multi-role "why"
		expect(screen.getByText("via hr, manager")).toBeInTheDocument();
		expect(screen.getByText("HR Manager")).toBeInTheDocument();
	});
});
