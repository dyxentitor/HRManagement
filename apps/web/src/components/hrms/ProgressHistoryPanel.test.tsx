import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ProgressHistoryPanel } from "./ProgressHistoryPanel";

interface Item {
	id: string;
	flight: boolean;
	v: string;
}

const items: Item[] = [
	{ id: "a", flight: true, v: "3" },
	{ id: "b", flight: true, v: "2" },
	{ id: "c", flight: false, v: "1" },
];

function renderPanel() {
	render(
		<ProgressHistoryPanel
			items={items}
			isInFlight={(i) => i.flight}
			getKey={(i) => i.id}
			sortValue={(i) => i.v}
			cardLimit={1}
			renderCard={(i) => <div>card-{i.id}</div>}
			renderRow={(i) => <div>row-{i.id}</div>}
		/>,
	);
}

describe("ProgressHistoryPanel", () => {
	it("caps in-progress cards and surfaces the overflow as +N more", () => {
		renderPanel();
		expect(screen.getByText("In progress · 2")).toBeInTheDocument();
		expect(screen.getByText("card-a")).toBeInTheDocument();
		// capped: second in-flight card is not rendered, but counted in the overflow
		expect(screen.queryByText("card-b")).not.toBeInTheDocument();
		expect(screen.getByText(/\+1 more in history/i)).toBeInTheDocument();
	});

	it("shows every item as compact rows under History", async () => {
		const user = userEvent.setup();
		renderPanel();
		await user.click(screen.getByRole("button", { name: "History" }));
		expect(screen.getByText("History · 3")).toBeInTheDocument();
		expect(screen.getByText("row-a")).toBeInTheDocument();
		expect(screen.getByText("row-b")).toBeInTheDocument();
		expect(screen.getByText("row-c")).toBeInTheDocument();
		// rich cards are not used in the history view
		expect(screen.queryByText("card-a")).not.toBeInTheDocument();
	});
});
