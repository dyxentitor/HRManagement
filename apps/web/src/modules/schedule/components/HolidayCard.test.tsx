import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HolidayCard } from "./HolidayCard";

describe("HolidayCard", () => {
	it("shows the date chip, full weekday, year, name and type", () => {
		render(
			<HolidayCard
				holiday={{ date: "2026-06-21", name: "Hari Raya Aidilfitri", type: "federal" }}
			/>,
		);
		expect(screen.getByText("21")).toBeInTheDocument();
		expect(screen.getByText("JUN")).toBeInTheDocument();
		expect(screen.getByText("Hari Raya Aidilfitri")).toBeInTheDocument();
		expect(screen.getByText(/Sunday · 2026/)).toBeInTheDocument(); // 2026-06-21 is Sunday
		expect(screen.getByText("Federal")).toBeInTheDocument();
	});

	it("labels state and company types", () => {
		const { rerender } = render(
			<HolidayCard holiday={{ date: "2026-02-01", name: "FT Day", type: "state" }} />,
		);
		expect(screen.getByText("State")).toBeInTheDocument();
		rerender(
			<HolidayCard holiday={{ date: "2026-03-10", name: "Founders", type: "company" }} />,
		);
		expect(screen.getByText("Company")).toBeInTheDocument();
	});
});
