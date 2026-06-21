import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ComingSoon } from "./ComingSoon";

describe("ComingSoon", () => {
	it("renders the title, message and highlights", () => {
		render(
			<MemoryRouter>
				<ComingSoon
					eyebrow="Performance & KPIs"
					title="KPIs are getting a rework"
					message="Back soon."
					highlights={["Goal setting", "Check-ins"]}
				/>
			</MemoryRouter>,
		);
		expect(screen.getByText("KPIs are getting a rework")).toBeInTheDocument();
		expect(screen.getByText("Performance & KPIs")).toBeInTheDocument();
		expect(screen.getByText("Goal setting")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Back to dashboard/i })).toBeInTheDocument();
	});
});
