import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RosterToolbar } from "./RosterToolbar";

describe("RosterToolbar", () => {
	it("renders range label and view mode toggle", () => {
		render(
			<RosterToolbar
				rangeLabel="Mar 2026"
				viewMode="month"
				onViewMode={vi.fn()}
				onPrev={vi.fn()}
				onNext={vi.fn()}
				teams={[]}
				teamId=""
				onTeamId={vi.fn()}
				search=""
				onSearch={vi.fn()}
				warningCount={0}
				unpublishedCount={5}
				onPublish={vi.fn()}
				onBuild={vi.fn()}
			/>,
		);
		expect(screen.getByText("Mar 2026")).toBeInTheDocument();
		expect(screen.getByText("Publish (5)")).toBeInTheDocument();
	});

	it("calls onPublish when clicked", async () => {
		const onPublish = vi.fn();
		render(
			<RosterToolbar
				rangeLabel="Mar 2026"
				viewMode="month"
				onViewMode={vi.fn()}
				onPrev={vi.fn()}
				onNext={vi.fn()}
				teams={[]}
				teamId=""
				onTeamId={vi.fn()}
				search=""
				onSearch={vi.fn()}
				warningCount={2}
				unpublishedCount={5}
				onPublish={onPublish}
				onBuild={vi.fn()}
			/>,
		);
		await userEvent.click(screen.getByText("Publish (5)"));
		expect(onPublish).toHaveBeenCalled();
	});
});
