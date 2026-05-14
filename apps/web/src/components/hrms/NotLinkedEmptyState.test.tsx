import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NotLinkedEmptyState } from "./NotLinkedEmptyState";

describe("NotLinkedEmptyState", () => {
	it("renders the title", () => {
		render(<NotLinkedEmptyState scope="profile" />);
		expect(
			screen.getByText(/account not linked to an employee/i),
		).toBeInTheDocument();
	});

	it("renders scope-specific copy for schedule", () => {
		render(<NotLinkedEmptyState scope="schedule" />);
		expect(
			screen.getByText(/your schedule or attendance/i),
		).toBeInTheDocument();
	});

	it("renders scope-specific copy for claims", () => {
		render(<NotLinkedEmptyState scope="claims" />);
		expect(screen.getByText(/your claims/i)).toBeInTheDocument();
	});
});
