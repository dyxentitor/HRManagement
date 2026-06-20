import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { ClaimCategory } from "../api";
import { ClaimCategoryGrid } from "./ClaimCategoryGrid";

const cats: ClaimCategory[] = [
	{ id: "c1", code: "MEDICAL", name: "Medical", requires_attachment: true, currency_code: "MYR" },
	{ id: "c2", code: "MEAL", name: "Meal", requires_attachment: false, currency_code: "MYR" },
];

describe("ClaimCategoryGrid", () => {
	it("renders a quick-launch card per category linking to the prefilled submit form", () => {
		render(
			<MemoryRouter>
				<ClaimCategoryGrid categories={cats} />
			</MemoryRouter>,
		);
		const medical = screen.getByRole("link", { name: /Medical/ });
		expect(medical).toHaveAttribute("href", "/claims/submit?category=c1");
		expect(screen.getByText("Receipt required")).toBeInTheDocument();
		expect(screen.getByText("No receipt needed")).toBeInTheDocument();
	});
});
