import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DonutChart } from "./DonutChart";

describe("DonutChart", () => {
	it("renders centre label", () => {
		render(
			<DonutChart
				centerLabel={
					<>
						<div>98%</div>
						<div>Present</div>
					</>
				}
				segments={[
					{ value: 75, color: "mint", label: "Present" },
					{ value: 15, color: "yellow", label: "Late" },
					{ value: 10, color: "coral", label: "Absent" },
				]}
			/>,
		);
		expect(screen.getByText("98%")).toBeInTheDocument();
	});

	it("renders all segment labels in legend", () => {
		render(
			<DonutChart
				centerLabel={<>x</>}
				segments={[
					{ value: 75, color: "mint", label: "Present" },
					{ value: 15, color: "yellow", label: "Late" },
					{ value: 10, color: "coral", label: "Absent" },
				]}
			/>,
		);
		expect(screen.getByText("Present")).toBeInTheDocument();
		expect(screen.getByText("Late")).toBeInTheDocument();
		expect(screen.getByText("Absent")).toBeInTheDocument();
	});

	it("renders percentage per segment in legend", () => {
		render(
			<DonutChart
				centerLabel={<>x</>}
				segments={[
					{ value: 75, color: "mint", label: "Present" },
					{ value: 25, color: "yellow", label: "Late" },
				]}
			/>,
		);
		expect(screen.getByText("75%")).toBeInTheDocument();
		expect(screen.getByText("25%")).toBeInTheDocument();
	});
});
