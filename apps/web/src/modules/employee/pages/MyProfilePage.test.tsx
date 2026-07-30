import { render, screen, waitFor, within } from "@testing-library/react";
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
	date_of_birth: "1992-08-14",
	gender: "female",
	nationality: "MY",
	marital_status: "single",
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

/** The identity hero renders the name as the only heading. */
const ready = () => screen.findByRole("heading", { name: "Ops Lead" });

describe("MyProfilePage", () => {
	it("renders the identity hero (name, role, tenure)", async () => {
		renderPage();
		await ready();
		expect(screen.getAllByText(/SOC Lead/).length).toBeGreaterThan(0);
		expect(screen.getByText(/joined/i)).toBeInTheDocument();
	});

	it("shows the record sections", async () => {
		renderPage();
		await ready();
		expect(screen.getByText("Personal details")).toBeInTheDocument();
		expect(screen.getByText("Employment")).toBeInTheDocument();
		expect(screen.getByText("Contact details")).toBeInTheDocument();
		expect(screen.getByText("Address")).toBeInTheDocument();
		expect(screen.getByText("Banking")).toBeInTheDocument();
	});

	it("surfaces the new read-only personal fields", async () => {
		renderPage();
		await ready();
		expect(screen.getByText("14 Aug 1992")).toBeInTheDocument();
		expect(screen.getByText("Female")).toBeInTheDocument();
		expect(screen.getByText("Single")).toBeInTheDocument();
	});

	it("masks IC and bank account to last 4 only", async () => {
		renderPage();
		await ready();
		expect(screen.getByText(/•+ 1234/)).toBeInTheDocument();
		expect(screen.getByText(/•+ 4321/)).toBeInTheDocument();
	});

	it("flags Banking as MFA-required", async () => {
		renderPage();
		await ready();
		expect(screen.getByText(/MFA required/i)).toBeInTheDocument();
	});

	it("the first editable section toggles an inline phone input", async () => {
		const user = userEvent.setup();
		renderPage();
		await ready();
		const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
		await user.click(editButtons[1]);
		expect(screen.getByLabelText(/^phone$/i)).toBeInstanceOf(HTMLInputElement);
		expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
	});

	it("Save calls updateMe and shows a success toast", async () => {
		const { toast } = await import("sonner");
		const user = userEvent.setup();
		renderPage();
		await ready();
		await user.click(screen.getAllByRole("button", { name: /^edit$/i })[1]);
		const phone = screen.getByLabelText(/^phone$/i) as HTMLInputElement;
		await user.clear(phone);
		await user.type(phone, "+60123");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		await waitFor(() => expect(mocks.updateMe).toHaveBeenCalled());
		expect(toast.success).toHaveBeenCalled();
	});

	it("Cancel discards changes and returns to the read-only view", async () => {
		const user = userEvent.setup();
		renderPage();
		await ready();
		await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
		await user.click(screen.getByRole("button", { name: /^cancel$/i }));
		expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
	});

	it("renders Address content", async () => {
		renderPage();
		await ready();
		expect(screen.getByText(/1 Jalan/)).toBeInTheDocument();
	});

	it("Banking Save with a bank_name change triggers the MFA prompt", async () => {
		const user = userEvent.setup();
		renderPage();
		await ready();
		// editable order: PersonalDetails(0), Contact(1), Address(2), Banking(3), Emergency(4)
		await user.click(screen.getAllByRole("button", { name: /^edit$/i })[3]);
		const bankInput = screen.getByLabelText(/bank name/i);
		await user.clear(bankInput);
		await user.type(bankInput, "NewBank");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(await screen.findByRole("dialog", { name: /mfa required/i })).toBeInTheDocument();
	});

	it("Banking exposes an account-number field; entering one triggers MFA and sends it", async () => {
		const user = userEvent.setup();
		renderPage();
		await ready();
		await user.click(screen.getAllByRole("button", { name: /^edit$/i })[3]);
		const acct = screen.getByLabelText(/account number/i);
		await user.type(acct, "555566667777");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		const dialog = await screen.findByRole("dialog", { name: /mfa required/i });
		expect(dialog).toBeInTheDocument();
		await user.type(within(dialog).getByLabelText(/mfa code/i), "123456");
		await user.click(within(dialog).getByRole("button", { name: /^submit$/i }));
		await waitFor(() => expect(mocks.updateMe).toHaveBeenCalled());
		const [payload, code] = mocks.updateMe.mock.calls.at(-1) as [
			Record<string, unknown>,
			string,
		];
		expect(payload.bank_account_number).toBe("555566667777");
		expect(code).toBe("123456");
	});

	it("read-only sections have no Edit button (5 editable sections)", async () => {
		renderPage();
		await ready();
		const editButtons = screen.queryAllByRole("button", { name: /^edit$/i });
		expect(editButtons.length).toBe(5);
	});

	it("Personal details is editable — changing gender saves via updateMe", async () => {
		const user = userEvent.setup();
		renderPage();
		await ready();
		// Personal details is the first editable section (index 0).
		await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
		const gender = screen.getByLabelText(/^gender$/i) as HTMLSelectElement;
		await user.selectOptions(gender, "male");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		await waitFor(() => expect(mocks.updateMe).toHaveBeenCalled());
		const payload = mocks.updateMe.mock.calls[0][0];
		expect(payload.gender).toBe("male");
	});
});
