import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
	it("renders title and description", () => {
		render(
			<EmptyState
				icon="🌴"
				title="No leave requests yet"
				description="Apply for your first leave to see it here."
			/>,
		);
		expect(screen.getByText("No leave requests yet")).toBeInTheDocument();
		expect(screen.getByText(/Apply for your first leave/)).toBeInTheDocument();
	});

	it("renders the action button slot", () => {
		render(
			<EmptyState
				icon="🌴"
				title="Empty"
				description="Try adding one"
				action={<button type="button">Add</button>}
			/>,
		);
		expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
	});
});
