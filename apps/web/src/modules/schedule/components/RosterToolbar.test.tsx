import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RosterToolbar } from "./RosterToolbar";

function props(over: Partial<Parameters<typeof RosterToolbar>[0]> = {}) {
	return {
		rangeLabel: "Mar 2026",
		viewMode: "month" as const,
		onViewMode: vi.fn(),
		onPrev: vi.fn(),
		onToday: vi.fn(),
		onNext: vi.fn(),
		teams: [],
		teamId: "",
		onTeamId: vi.fn(),
		search: "",
		onSearch: vi.fn(),
		onBuild: vi.fn(),
		onValidate: vi.fn(),
		...over,
	};
}

describe("RosterToolbar", () => {
	it("renders range label, view toggle, and grouped actions", () => {
		render(<RosterToolbar {...props()} />);
		expect(screen.getByText("Mar 2026")).toBeInTheDocument();
		expect(screen.getByText("Week")).toBeInTheDocument();
		expect(screen.getByText("Validate")).toBeInTheDocument();
		expect(screen.getByText("Build Roster")).toBeInTheDocument();
	});

	it("calls onValidate and onBuild when clicked", async () => {
		const onValidate = vi.fn();
		const onBuild = vi.fn();
		render(<RosterToolbar {...props({ onValidate, onBuild })} />);
		await userEvent.click(screen.getByText("Validate"));
		await userEvent.click(screen.getByText("Build Roster"));
		expect(onValidate).toHaveBeenCalled();
		expect(onBuild).toHaveBeenCalled();
	});
});
