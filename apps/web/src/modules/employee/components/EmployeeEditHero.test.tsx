import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./AvatarUpload", () => ({
	AvatarUpload: ({ fullName }: { fullName: string }) => <div>avatar:{fullName}</div>,
}));
vi.mock("@/lib/perm", () => ({ useCan: () => true }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const inv = vi.hoisted(() => ({ list: vi.fn(), copyLink: vi.fn() }));
vi.mock("@/modules/admin/invitations-api", () => ({ invitationsApi: inv }));
vi.mock("../api", () => ({ employeeApi: { sendInvite: vi.fn(), archive: vi.fn() } }));

import type { Employee } from "../api";
import { EmployeeEditHero } from "./EmployeeEditHero";

const employee = {
	id: "e1",
	user_id: "u1",
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
	it("shows identity, meta strip, completeness and quick actions", async () => {
		inv.list.mockResolvedValue([]); // no existing invitation → "Send invite"
		render(<EmployeeEditHero employee={employee} onPhotoChange={() => {}} />);

		expect(screen.getByText("Tan Wei Ming")).toBeInTheDocument();
		expect(screen.getByText(/Senior Engineer · Engineering/)).toBeInTheDocument();
		expect(screen.getByText("PVT-DEMO-005")).toBeInTheDocument(); // meta strip
		expect(screen.getByText("80%")).toBeInTheDocument();
		expect(screen.getByText(/Bank Details/i)).toBeInTheDocument();

		await waitFor(() => expect(inv.list).toHaveBeenCalled());
		expect(screen.getByRole("button", { name: /send invite/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /reset password/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /archive/i })).toBeInTheDocument();
	});
});
