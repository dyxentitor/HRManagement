import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiTile } from "./KpiTile";

describe("KpiTile", () => {
	it("renders label and value", () => {
		render(<KpiTile tone="mint" label="Attendance" value="98%" />);
		expect(screen.getByText("Attendance")).toBeInTheDocument();
		expect(screen.getByText("98%")).toBeInTheDocument();
	});

	it("renders delta when given", () => {
		render(
			<KpiTile
				tone="peach"
				label="Annual leave"
				value="14 d"
				delta="+2 carried"
			/>,
		);
		expect(screen.getByText("+2 carried")).toBeInTheDocument();
	});

	it("renders icon character in the circle", () => {
		render(<KpiTile tone="yellow" label="Open KPIs" value="3" icon="3" />);
		expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(2);
	});
});
