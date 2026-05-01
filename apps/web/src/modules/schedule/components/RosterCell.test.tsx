import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RosterCell } from "./RosterCell";

describe("RosterCell", () => {
	it("renders shift letter for assigned cell", () => {
		render(
			<RosterCell
				viewMode="month"
				tone={{ kind: "shift", letter: "M", tone: "accent", isPublished: true }}
				employeeName="Syafiq"
				date="2026-03-04"
				shiftName="Morning"
				startTime="09:00"
				endTime="18:00"
				selected={false}
				onClick={() => {}}
				onShiftClick={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: /Mar 4/ })).toBeInTheDocument();
		expect(screen.getByText("M")).toBeInTheDocument();
	});

	it("calls onClick on plain click", async () => {
		const onClick = vi.fn();
		render(
			<RosterCell
				viewMode="month"
				tone={{ kind: "off", letter: "X", tone: "surface" }}
				employeeName="A"
				date="2026-03-04"
				shiftName={null}
				startTime={null}
				endTime={null}
				selected={false}
				onClick={onClick}
				onShiftClick={() => {}}
			/>,
		);
		await userEvent.click(screen.getByRole("button"));
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("calls onShiftClick on shift+click", async () => {
		const onShiftClick = vi.fn();
		render(
			<RosterCell
				viewMode="month"
				tone={{ kind: "off", letter: "X", tone: "surface" }}
				employeeName="A"
				date="2026-03-04"
				shiftName={null}
				startTime={null}
				endTime={null}
				selected={false}
				onClick={() => {}}
				onShiftClick={onShiftClick}
			/>,
		);
		const user = userEvent.setup();
		await user.keyboard("{Shift>}");
		await user.click(screen.getByRole("button"));
		await user.keyboard("{/Shift}");
		expect(onShiftClick).toHaveBeenCalledTimes(1);
	});

	it("shows draft dot for unpublished assignment", () => {
		render(
			<RosterCell
				viewMode="month"
				tone={{
					kind: "shift",
					letter: "M",
					tone: "accent",
					isPublished: false,
				}}
				employeeName="A"
				date="2026-03-04"
				shiftName="Morning"
				startTime="09:00"
				endTime="18:00"
				selected={false}
				onClick={() => {}}
				onShiftClick={() => {}}
			/>,
		);
		expect(screen.getByTestId("draft-dot")).toBeInTheDocument();
	});
});
