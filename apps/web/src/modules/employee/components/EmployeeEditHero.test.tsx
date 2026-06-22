import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// AvatarUpload pulls in the upload API; stub it to a simple avatar for this test.
vi.mock("./AvatarUpload", () => ({
	AvatarUpload: ({ fullName }: { fullName: string }) => <div>avatar:{fullName}</div>,
}));

import type { Employee } from "../api";
import { EmployeeEditHero } from "./EmployeeEditHero";

const employee = {
	id: "e1",
	full_name: "Tan Wei Ming",
	role_title: "Senior Engineer",
	department_name: "Engineering",
	employee_code: "PVT-DEMO-005",
	email: "tan@x.com",
	phone: "+60123456789",
	status: "active",
	photo_url: null,
	profile_completeness: { percent: 80, missing: ["bank_details"] },
} as unknown as Employee;

describe("EmployeeEditHero", () => {
	it("shows identity, role, chips and completeness", () => {
		render(<EmployeeEditHero employee={employee} onPhotoChange={() => {}} />);
		expect(screen.getByText("Tan Wei Ming")).toBeInTheDocument();
		expect(screen.getByText(/Senior Engineer · Engineering/)).toBeInTheDocument();
		expect(screen.getByText("PVT-DEMO-005")).toBeInTheDocument();
		expect(screen.getByText("80%")).toBeInTheDocument();
		expect(screen.getByText(/Bank Details/i)).toBeInTheDocument(); // humanized missing field
	});
});
