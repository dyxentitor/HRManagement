import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LeaveTypeCarryForwardTab } from "./LeaveTypeCarryForwardTab";

const base = { carry_forward_max: "0", carry_forward_expiry_months: null };

describe("LeaveTypeCarryForwardTab", () => {
	it("starts in 'No carry-forward' mode when max is 0", () => {
		render(<LeaveTypeCarryForwardTab value={base} onChange={() => {}} />);
		const radio = screen.getByRole("radio", { name: /No carry-forward/i });
		expect(radio).toBeChecked();
	});

	it("emits no-carry payload when 'No carry-forward' clicked from another mode", async () => {
		const onChange = vi.fn();
		render(
			<LeaveTypeCarryForwardTab
				value={{ carry_forward_max: "5", carry_forward_expiry_months: 12 }}
				onChange={onChange}
			/>,
		);
		await userEvent.click(
			screen.getByRole("radio", { name: /No carry-forward/i }),
		);
		expect(onChange).toHaveBeenCalledWith({
			carry_forward_max: "0",
			carry_forward_expiry_months: null,
		});
	});

	it("emits unlimited sentinel when 'Unlimited' clicked", async () => {
		const onChange = vi.fn();
		render(<LeaveTypeCarryForwardTab value={base} onChange={onChange} />);
		await userEvent.click(
			screen.getByRole("radio", { name: /Unlimited carry-forward/i }),
		);
		expect(onChange).toHaveBeenCalledWith({
			carry_forward_max: "99999",
			carry_forward_expiry_months: null,
		});
	});

	it("shows max + expiry inputs only in 'Capped with expiry' mode", () => {
		render(
			<LeaveTypeCarryForwardTab
				value={{ carry_forward_max: "5", carry_forward_expiry_months: 12 }}
				onChange={() => {}}
			/>,
		);
		expect(screen.getByLabelText(/Max days/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/Expires after/i)).toBeInTheDocument();
	});
});
