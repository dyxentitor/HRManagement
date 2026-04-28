import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
	it("renders title", () => {
		render(<PageHeader title="Employees" />);
		expect(
			screen.getByRole("heading", { level: 1, name: "Employees" }),
		).toBeInTheDocument();
	});

	it("renders breadcrumb when given", () => {
		render(<PageHeader breadcrumb="Dashboard / My view" title="Hello" />);
		expect(screen.getByText("Dashboard / My view")).toBeInTheDocument();
	});

	it("renders actions slot", () => {
		render(
			<PageHeader
				title="Employees"
				actions={<button type="button">Add</button>}
			/>,
		);
		expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
	});
});
