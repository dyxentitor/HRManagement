import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
	it("renders the label and is clickable", () => {
		render(<Button>Approve</Button>);
		expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
	});
});
