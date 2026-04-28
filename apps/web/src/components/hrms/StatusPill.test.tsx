import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
	it("renders the label", () => {
		render(<StatusPill tone="mint" label="Approved" />);
		expect(screen.getByText("Approved")).toBeInTheDocument();
	});

	it("applies tone-specific classes", () => {
		const { container } = render(<StatusPill tone="coral" label="Rejected" />);
		const pill = container.firstElementChild as HTMLElement;
		expect(pill.className).toMatch(/coral/);
	});

	it("renders icon when given", () => {
		render(<StatusPill tone="yellow" label="Pending" icon="⏳" />);
		expect(screen.getByText(/⏳/)).toBeInTheDocument();
	});
});
