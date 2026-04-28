import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ClockInOutWidget } from "./ClockInOutWidget";

describe("ClockInOutWidget", () => {
	beforeAll(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-28T09:00:00+08:00"));
	});
	afterAll(() => {
		vi.useRealTimers();
	});

	it("shows Clock in button when not clocked in", () => {
		render(
			<ClockInOutWidget
				state={{ status: "off" }}
				onClockIn={() => {}}
				onClockOut={() => {}}
			/>,
		);
		expect(
			screen.getByRole("button", { name: /clock in/i }),
		).toBeInTheDocument();
	});

	it("shows Clock out button when clocked in", () => {
		render(
			<ClockInOutWidget
				state={{ status: "in", since: "2026-04-28T08:30:00+08:00" }}
				onClockIn={() => {}}
				onClockOut={() => {}}
			/>,
		);
		expect(
			screen.getByRole("button", { name: /clock out/i }),
		).toBeInTheDocument();
	});

	it("calls onClockIn when button clicked", () => {
		const onClockIn = vi.fn();
		render(
			<ClockInOutWidget
				state={{ status: "off" }}
				onClockIn={onClockIn}
				onClockOut={() => {}}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /clock in/i }));
		expect(onClockIn).toHaveBeenCalled();
	});

	it("displays elapsed since clock-in", () => {
		render(
			<ClockInOutWidget
				state={{ status: "in", since: "2026-04-28T08:30:00+08:00" }}
				onClockIn={() => {}}
				onClockOut={() => {}}
			/>,
		);
		expect(screen.getByText(/30 min/)).toBeInTheDocument();
	});
});
