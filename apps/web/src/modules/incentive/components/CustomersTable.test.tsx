import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------------ mocks */

const customersList = vi.hoisted(() => vi.fn());
const customersUpdate = vi.hoisted(() => vi.fn());
const customersDeactivate = vi.hoisted(() => vi.fn());
const customersReactivate = vi.hoisted(() => vi.fn());
const customersTopUp = vi.hoisted(() => vi.fn());
const customersCreate = vi.hoisted(() => vi.fn());

vi.mock("../api", () => ({
	incentiveApi: {
		customers: {
			list: customersList,
			create: customersCreate,
			update: customersUpdate,
			deactivate: customersDeactivate,
			reactivate: customersReactivate,
			topUp: customersTopUp,
		},
	},
}));

const useCan = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/lib/perm", () => ({ useCan }));

import { CustomersTable } from "./CustomersTable";

/* ------------------------------------------------------------------ fixtures */

function makeCustomer(overrides: Partial<{
	id: string;
	name: string;
	is_active: boolean;
	notes: string;
	mandays_total: string;
	mandays_remaining: string;
	created_at: string;
}> = {}) {
	return {
		id: "c1",
		name: "Acme Corp",
		is_active: true,
		notes: "VIP",
		mandays_total: "200",
		mandays_remaining: "120",
		created_at: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

const BASE_CUSTOMERS = [
	makeCustomer({ id: "c1", name: "Acme Corp" }),
	makeCustomer({ id: "c2", name: "Initech" }),
];

beforeEach(() => {
	vi.clearAllMocks();
	useCan.mockReturnValue(true);
	customersList.mockResolvedValue(BASE_CUSTOMERS);
	customersUpdate.mockResolvedValue({});
	customersDeactivate.mockResolvedValue(undefined);
	customersReactivate.mockResolvedValue({});
	customersTopUp.mockResolvedValue({});
});

/* ================================================================== tests */

describe("CustomersTable", () => {
	it("renders customer rows", async () => {
		render(<CustomersTable onChanged={vi.fn()} />);
		await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument());
		expect(screen.getByText("Initech")).toBeInTheDocument();
		// Status pills
		expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(2);
		// Pool info
		expect(screen.getAllByText(/120 \/ 200 md/).length).toBeGreaterThanOrEqual(1);
	});

	it("shows loading skeleton while fetching", () => {
		// Never resolves
		customersList.mockReturnValue(new Promise(() => {}));
		render(<CustomersTable onChanged={vi.fn()} />);
		expect(screen.getByLabelText("Loading customers")).toBeInTheDocument();
	});

	it("shows empty state when no customers", async () => {
		customersList.mockResolvedValue([]);
		render(<CustomersTable onChanged={vi.fn()} />);
		await waitFor(() =>
			expect(screen.getByText(/No customers yet/)).toBeInTheDocument(),
		);
	});

	it("search input filters by name", async () => {
		const user = userEvent.setup();
		render(<CustomersTable onChanged={vi.fn()} />);
		await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument());
		await user.type(screen.getByLabelText("Search customers"), "Acme");
		expect(screen.getByText("Acme Corp")).toBeInTheDocument();
		expect(screen.queryByText("Initech")).not.toBeInTheDocument();
	});

	it("clicking Name header toggles sort order", async () => {
		const user = userEvent.setup();
		// Z → A order initially: desc
		customersList.mockResolvedValue([
			makeCustomer({ id: "c1", name: "Zebra" }),
			makeCustomer({ id: "c2", name: "Alpha" }),
		]);
		render(<CustomersTable onChanged={vi.fn()} />);
		await waitFor(() => expect(screen.getByText("Zebra")).toBeInTheDocument());

		const nameHeader = screen.getByRole("button", { name: /Name/i });
		// Default is asc: Alpha first
		const cells = screen.getAllByRole("cell");
		const nameCells = cells.filter(
			(c) => c.textContent === "Zebra" || c.textContent === "Alpha",
		);
		expect(nameCells[0].textContent).toBe("Alpha");

		// Click once → desc: Zebra first
		await user.click(nameHeader);
		const cells2 = screen.getAllByRole("cell");
		const nameCells2 = cells2.filter(
			(c) => c.textContent === "Zebra" || c.textContent === "Alpha",
		);
		expect(nameCells2[0].textContent).toBe("Zebra");
	});

	it("paginates: 12 rows → prev/next navigation", async () => {
		const many = Array.from({ length: 12 }, (_, i) =>
			makeCustomer({ id: `c${i}`, name: `Customer ${String(i + 1).padStart(2, "0")}` }),
		);
		customersList.mockResolvedValue(many);
		const user = userEvent.setup();
		render(<CustomersTable onChanged={vi.fn()} />);
		await waitFor(() => expect(screen.getByText("Customer 01")).toBeInTheDocument());

		// Page 1: 1–10 of 12
		expect(screen.getByText("1–10 of 12")).toBeInTheDocument();
		expect(screen.queryByText("Customer 11")).not.toBeInTheDocument();

		// Go to page 2
		await user.click(screen.getByRole("button", { name: /Next/i }));
		await waitFor(() => expect(screen.getByText("Customer 11")).toBeInTheDocument());
		expect(screen.getByText("11–12 of 12")).toBeInTheDocument();
		expect(screen.queryByText("Customer 01")).not.toBeInTheDocument();

		// Prev disabled check
		const prevBtn = screen.getByRole("button", { name: /Prev/i });
		expect(prevBtn).not.toBeDisabled();
		await user.click(prevBtn);
		await waitFor(() => expect(screen.getByText("1–10 of 12")).toBeInTheDocument());
	});

	it("'Show inactive' toggle re-calls list with { includeInactive: true }", async () => {
		const user = userEvent.setup();
		render(<CustomersTable onChanged={vi.fn()} />);
		await waitFor(() => expect(customersList).toHaveBeenCalledWith({ includeInactive: false }));

		await user.click(screen.getByLabelText("Show inactive"));
		await waitFor(() =>
			expect(customersList).toHaveBeenCalledWith({ includeInactive: true }),
		);
	});

	it("Edit opens pre-filled EditCustomerModal; save PATCHes + calls onChanged", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		render(<CustomersTable onChanged={onChanged} />);
		await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument());

		// Click first Edit button
		const editBtns = screen.getAllByRole("button", { name: /Edit/i });
		await user.click(editBtns[0]);

		// Modal opens pre-filled with "Acme Corp"
		await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
		const dialog = screen.getByRole("dialog");
		const nameInput = within(dialog).getByLabelText("Customer name");
		expect((nameInput as HTMLInputElement).value).toBe("Acme Corp");

		// Clear + retype
		await user.clear(nameInput);
		await user.type(nameInput, "Acme Corp Updated");

		// Save
		await user.click(within(dialog).getByRole("button", { name: /Save changes/i }));
		await waitFor(() => expect(customersUpdate).toHaveBeenCalledWith(
			"c1",
			expect.objectContaining({ name: "Acme Corp Updated" }),
		));
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
	});

	it("Deactivate opens confirm dialog; confirm → deactivate + onChanged", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		render(<CustomersTable onChanged={onChanged} />);
		await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument());

		// Click first Deactivate button
		const deactivateBtns = screen.getAllByRole("button", { name: /Deactivate/i });
		await user.click(deactivateBtns[0]);

		// Confirm dialog appears
		await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText(/hides the customer from new projects/i)).toBeInTheDocument();

		// Confirm
		await user.click(within(dialog).getByRole("button", { name: /Deactivate/i }));
		await waitFor(() => expect(customersDeactivate).toHaveBeenCalledWith("c1"));
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
	});

	it("Reactivate button shown for inactive rows", async () => {
		const inactive = makeCustomer({ id: "c3", name: "Old Client", is_active: false });
		customersList.mockResolvedValue([inactive]);
		render(<CustomersTable onChanged={vi.fn()} />);
		await waitFor(() => expect(screen.getByText("Old Client")).toBeInTheDocument());
		expect(screen.getByRole("button", { name: /Reactivate/i })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Deactivate/i })).not.toBeInTheDocument();
	});

	it("Reactivate confirm → reactivate + onChanged", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		const inactive = makeCustomer({ id: "c3", name: "Old Client", is_active: false });
		customersList.mockResolvedValue([inactive]);
		render(<CustomersTable onChanged={onChanged} />);
		await waitFor(() => expect(screen.getByText("Old Client")).toBeInTheDocument());

		await user.click(screen.getByRole("button", { name: /Reactivate/i }));
		await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
		const dialog = screen.getByRole("dialog");
		await user.click(within(dialog).getByRole("button", { name: /Reactivate/i }));
		await waitFor(() => expect(customersReactivate).toHaveBeenCalledWith("c3"));
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
	});

	it("no action buttons when useCan returns false", async () => {
		useCan.mockReturnValue(false);
		render(<CustomersTable onChanged={vi.fn()} />);
		await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument());
		expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Deactivate/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Top up/i })).not.toBeInTheDocument();
	});
});
