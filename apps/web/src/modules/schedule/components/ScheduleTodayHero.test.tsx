import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleTodayHero } from "./ScheduleTodayHero";

const shift = {
	name: "Night",
	tone: "sky" as const,
	timeRange: "21:00–06:00",
	isCoverUp: false,
	coveringForName: null,
	isDraft: false,
};

describe("ScheduleTodayHero", () => {
	it("shows today's shift, status and the clock widget", () => {
		render(
			<ScheduleTodayHero
				dateLabel="Tue 10 Jun"
				statusLabel="On duty"
				statusTone="mint"
				clockState={{ status: "in", since: new Date().toISOString() }}
				isHolidayWork={false}
				holidayName={null}
				shift={shift}
				busy={false}
				onClockIn={vi.fn()}
				onClockOut={vi.fn()}
			/>,
		);
		expect(screen.getByText("Night")).toBeInTheDocument();
		expect(screen.getByText("21:00–06:00")).toBeInTheDocument();
		expect(screen.getByText("On duty")).toBeInTheDocument();
		expect(screen.getByText(/Clock in \/ out/i)).toBeInTheDocument();
	});
	it("shows a no-shift message when none", () => {
		render(
			<ScheduleTodayHero
				dateLabel="Tue 10 Jun"
				statusLabel="No record"
				statusTone="peach"
				clockState={{ status: "off" }}
				isHolidayWork={false}
				holidayName={null}
				shift={null}
				busy={false}
				onClockIn={vi.fn()}
				onClockOut={vi.fn()}
			/>,
		);
		expect(screen.getByText(/No shift scheduled today/i)).toBeInTheDocument();
	});
});
