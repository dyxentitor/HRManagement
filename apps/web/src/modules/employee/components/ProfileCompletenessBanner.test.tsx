import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";

import type { Employee } from "../api";
import { ProfileCompletenessBanner } from "./ProfileCompletenessBanner";

function emp(partial: Partial<Employee>): Employee {
	return { id: "e1", full_name: "Test Person", ...partial } as Employee;
}

describe("ProfileCompletenessBanner", () => {
	test("shows percent and humanized missing groups when < 100%", () => {
		render(
			<MemoryRouter>
				<ProfileCompletenessBanner
					employee={emp({
						profile_completeness: {
							percent: 60,
							missing: ["bank_details", "emergency_contact"],
						},
					})}
				/>
			</MemoryRouter>,
		);
		expect(screen.getByText(/60% complete/)).toBeInTheDocument();
		expect(screen.getByText(/bank details/)).toBeInTheDocument();
		expect(screen.getByText(/emergency contact/)).toBeInTheDocument();
	});

	test("renders nothing at 100%", () => {
		const { container } = render(
			<MemoryRouter>
				<ProfileCompletenessBanner
					employee={emp({
						profile_completeness: { percent: 100, missing: [] },
					})}
				/>
			</MemoryRouter>,
		);
		expect(container).toBeEmptyDOMElement();
	});

	test("renders nothing when profile_completeness is undefined", () => {
		const { container } = render(
			<MemoryRouter>
				<ProfileCompletenessBanner employee={emp({})} />
			</MemoryRouter>,
		);
		expect(container).toBeEmptyDOMElement();
	});

	test("links to the employee edit page", () => {
		render(
			<MemoryRouter>
				<ProfileCompletenessBanner
					employee={emp({
						profile_completeness: { percent: 60, missing: ["contact"] },
					})}
				/>
			</MemoryRouter>,
		);
		const link = screen.getByRole("link", { name: /complete profile/i });
		expect(link).toHaveAttribute("href", "/employees/e1/edit");
	});
});
