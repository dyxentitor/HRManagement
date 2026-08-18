import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ScheduleDayCard } from "./ScheduleDayCard";

const shift = {
	name: "Morning",
	tone: "accent" as const,
	timeRange: "09:00–17:00",
	isCoverUp: false,
	coveringForName: null,
	isDraft: false,
};

describe("ScheduleDayCard", () => {
	it("shows shift name, time range and weekday/date", () => {
		render(
			<ScheduleDayCard date="2026-06-08" isToday={false} isWeekend={false} shift={shift} />,
		);
		expect(screen.getByText("Morning")).toBeInTheDocument();
		expect(screen.getByText("09:00–17:00")).toBeInTheDocument();
		expect(screen.getByText(/Mon/)).toBeInTheDocument();
	});
	it("shows Off when no shift", () => {
		render(
			<ScheduleDayCard date="2026-06-08" isToday={false} isWeekend={false} shift={null} />,
		);
		expect(screen.getByText("Off")).toBeInTheDocument();
	});
	it("shows Public holiday + name when holiday and no shift", () => {
		render(
			<ScheduleDayCard
				date="2026-06-10"
				isToday={false}
				isWeekend={false}
				holidayName="Hari Raya"
				shift={null}
			/>,
		);
		expect(screen.getByText("Public holiday")).toBeInTheDocument();
		expect(screen.getByTitle("Hari Raya")).toBeInTheDocument();
	});
	it("marks today with a Today badge + accent ring", () => {
		const { container } = render(
			<ScheduleDayCard date="2026-06-08" isToday isWeekend={false} shift={shift} />,
		);
		expect(screen.getByText(/Today/i)).toBeInTheDocument();
		expect(container.firstChild).toHaveClass("border-accent-500");
	});

	it("shows Request swap only when the handler is supplied", async () => {
		const onRequestSwap = vi.fn();
		const nightShift = {
			name: "Night",
			tone: "sky" as const,
			timeRange: "21:00 – 06:00",
			isCoverUp: false,
			coveringForName: null,
			isDraft: false,
		};

		const { rerender } = render(
			<ScheduleDayCard date="2026-09-01" isToday={false} isWeekend={false} shift={nightShift} />,
		);
		expect(screen.queryByRole("button", { name: /request swap/i })).not.toBeInTheDocument();

		rerender(
			<ScheduleDayCard
				date="2026-09-01"
				isToday={false}
				isWeekend={false}
				shift={nightShift}
				onRequestSwap={onRequestSwap}
			/>,
		);
		await userEvent.click(screen.getByRole("button", { name: /request swap/i }));
		expect(onRequestSwap).toHaveBeenCalled();
	});
});
