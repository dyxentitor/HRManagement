import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const me = {
	employee_code: "PVT-OPS-001",
	full_name: "Ops Lead",
	preferred_name: "Ops",
	email: "ops@provintell.local",
	phone: "+60 12 345 6789",
	alt_phone: "",
	role_title: "SOC Lead",
	employment_type: "fulltime",
	hire_date: "2024-01-15",
	status: "active",
	department: "Operations",
	bank_name: "Maybank",
	bank_account_last4: "4321",
	ic_last4: "1234",
	emergency_contact_name: "Jane Doe",
	emergency_contact_phone: "+60 12 222 3333",
	emergency_contact_relationship: "Spouse",
};

const mocks = vi.hoisted(() => ({
	getMe: vi.fn(),
}));

vi.mock("../api", () => ({
	employeeApi: { getMe: mocks.getMe },
}));

import MyProfilePage from "./MyProfilePage";

function renderPage() {
	return render(
		<MemoryRouter>
			<MyProfilePage />
		</MemoryRouter>,
	);
}

describe("MyProfilePage", () => {
	it("renders name, role, and joined", async () => {
		mocks.getMe.mockResolvedValue(me);
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		expect(screen.getAllByText(/SOC Lead/)[0]).toBeInTheDocument();
		expect(screen.getByText(/Joined/i)).toBeInTheDocument();
	});

	it("shows three sections: Personal, Employment, Banking", async () => {
		mocks.getMe.mockResolvedValue(me);
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		expect(
			screen.getByRole("heading", { name: /Personal/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /Employment/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /Banking/i }),
		).toBeInTheDocument();
	});

	it("masks IC and bank account to last 4 only", async () => {
		mocks.getMe.mockResolvedValue(me);
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		expect(screen.getByText(/•+ 1234/)).toBeInTheDocument();
		expect(screen.getByText(/•+ 4321/)).toBeInTheDocument();
	});

	it("flags Banking as MFA-required", async () => {
		mocks.getMe.mockResolvedValue(me);
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		expect(screen.getByText(/MFA required/i)).toBeInTheDocument();
	});
});
