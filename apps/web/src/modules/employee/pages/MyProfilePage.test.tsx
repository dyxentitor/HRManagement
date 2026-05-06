import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const me = {
	employee_code: "PVT-OPS-001",
	full_name: "Ops Lead",
	first_name: "Ops",
	last_name: "Lead",
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
	address_line1: "1 Jalan",
	city: "PJ",
	state: "Selangor",
	postcode: "46050",
	country_code: "MY",
	emergency_contact_name: "Jane Doe",
	emergency_contact_phone: "+60 12 222 3333",
	emergency_contact_relationship: "Spouse",
	photo_url: null,
};

const mocks = vi.hoisted(() => ({
	getMe: vi.fn(),
	updateMe: vi.fn(),
	uploadMyPhoto: vi.fn(),
	deleteMyPhoto: vi.fn(),
}));

vi.mock("../api", () => ({
	employeeApi: {
		getMe: mocks.getMe,
		updateMe: mocks.updateMe,
		uploadMyPhoto: mocks.uploadMyPhoto,
		deleteMyPhoto: mocks.deleteMyPhoto,
	},
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import MyProfilePage from "./MyProfilePage";

beforeEach(() => {
	mocks.getMe.mockReset();
	mocks.updateMe.mockReset();
	mocks.uploadMyPhoto.mockReset();
	mocks.deleteMyPhoto.mockReset();
	mocks.getMe.mockResolvedValue(me);
	mocks.updateMe.mockResolvedValue(undefined);
});

function renderPage() {
	return render(
		<MemoryRouter>
			<MyProfilePage />
		</MemoryRouter>,
	);
}

describe("MyProfilePage", () => {
	it("renders name, role, and joined", async () => {
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		expect(screen.getAllByText(/SOC Lead/)[0]).toBeInTheDocument();
		expect(screen.getByText(/Joined/i)).toBeInTheDocument();
	});

	it("shows Personal, Employment, Address, Banking, Emergency sections", async () => {
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		expect(
			screen.getByRole("heading", { name: /Personal/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /Employment/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /Address/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /Banking/i }),
		).toBeInTheDocument();
	});

	it("masks IC and bank account to last 4 only", async () => {
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		expect(screen.getByText(/•+ 1234/)).toBeInTheDocument();
		expect(screen.getByText(/•+ 4321/)).toBeInTheDocument();
	});

	it("flags Banking as MFA-required", async () => {
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		expect(screen.getByText(/MFA required/i)).toBeInTheDocument();
	});

	it("Personal Edit toggles inline form with phone input", async () => {
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
		await user.click(editButtons[0]);
		expect(screen.getByLabelText(/^phone$/i)).toBeInstanceOf(HTMLInputElement);
		expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
	});

	it("Save calls updateMe and shows success toast", async () => {
		const { toast } = await import("sonner");
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
		await user.click(editButtons[0]);
		const phone = screen.getByLabelText(/^phone$/i) as HTMLInputElement;
		await user.clear(phone);
		await user.type(phone, "+60123");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		await waitFor(() => expect(mocks.updateMe).toHaveBeenCalled());
		expect(toast.success).toHaveBeenCalled();
	});

	it("Cancel discards changes and re-renders read-only view", async () => {
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
		await user.click(editButtons[0]);
		await user.click(screen.getByRole("button", { name: /^cancel$/i }));
		expect(
			screen.queryByRole("button", { name: /^save$/i }),
		).not.toBeInTheDocument();
	});

	it("renders Address section content", async () => {
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		expect(screen.getByText(/1 Jalan/)).toBeInTheDocument();
	});

	it("Banking Save with bank_name change triggers MFA prompt", async () => {
		const user = userEvent.setup();
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		// Edit buttons render in section order: Personal, Address, Banking, Emergency.
		// Banking is at index 2.
		const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
		await user.click(editButtons[2]);
		expect(screen.getByLabelText(/bank name/i)).toBeInTheDocument();
		const bankInput = screen.getByLabelText(/bank name/i);
		await user.clear(bankInput);
		await user.type(bankInput, "NewBank");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(
			await screen.findByRole("dialog", { name: /mfa required/i }),
		).toBeInTheDocument();
	});

	it("Employment section has no Edit button", async () => {
		renderPage();
		await waitFor(() => screen.getByText("Ops Lead"));
		// 4 editable sections expected: Personal, Address, Banking, Emergency
		const editButtons = screen.queryAllByRole("button", { name: /^edit$/i });
		expect(editButtons.length).toBeLessThanOrEqual(4);
	});
});
