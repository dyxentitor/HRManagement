import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ManagerPicker } from "./ManagerPicker";

const options = [
	{ id: "e1", full_name: "Alice Lim", role_title: "Eng Lead" },
	{ id: "e2", full_name: "Bob Tan", role_title: "Engineer" },
	{ id: "e3", full_name: "Carol Wong", role_title: "Engineer" },
];

describe("ManagerPicker", () => {
	it("renders trigger with placeholder when no value selected, list hidden", () => {
		render(
			<ManagerPicker
				value={null}
				excludeIds={[]}
				options={options}
				onChange={() => {}}
			/>,
		);
		const trigger = screen.getByLabelText(/manager/i);
		expect(trigger).toHaveTextContent(/select a manager/i);
		// Candidate names not in DOM until trigger is clicked.
		expect(screen.queryByText("Alice Lim")).not.toBeInTheDocument();
		expect(screen.queryByText("Bob Tan")).not.toBeInTheDocument();
	});

	it("shows selected manager's name on the trigger button", () => {
		render(
			<ManagerPicker
				value="e1"
				excludeIds={[]}
				options={options}
				onChange={() => {}}
			/>,
		);
		expect(screen.getByLabelText(/manager/i)).toHaveTextContent("Alice Lim");
	});

	it("opens the list when the trigger is clicked", async () => {
		const user = userEvent.setup();
		render(
			<ManagerPicker
				value={null}
				excludeIds={[]}
				options={options}
				onChange={() => {}}
			/>,
		);
		await user.click(screen.getByLabelText(/manager/i));
		expect(await screen.findByText("Alice Lim")).toBeInTheDocument();
		expect(screen.getByText("Bob Tan")).toBeInTheDocument();
	});

	it("closes the list after a candidate is selected", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<ManagerPicker
				value={null}
				excludeIds={[]}
				options={options}
				onChange={onChange}
			/>,
		);
		await user.click(screen.getByLabelText(/manager/i));
		await user.click(await screen.findByText("Alice Lim"));
		expect(onChange).toHaveBeenCalledWith("e1");
		// List items disappear after selection.
		await waitFor(() => {
			expect(screen.queryByText("Bob Tan")).not.toBeInTheDocument();
		});
	});

	it("closes the list when Escape is pressed", async () => {
		const user = userEvent.setup();
		render(
			<ManagerPicker
				value={null}
				excludeIds={[]}
				options={options}
				onChange={() => {}}
			/>,
		);
		await user.click(screen.getByLabelText(/manager/i));
		expect(await screen.findByText("Alice Lim")).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await waitFor(() => {
			expect(screen.queryByText("Alice Lim")).not.toBeInTheDocument();
		});
	});

	it("filters by typed text (existing test, adapted)", async () => {
		const user = userEvent.setup();
		render(
			<ManagerPicker
				value={null}
				excludeIds={[]}
				options={options}
				onChange={() => {}}
			/>,
		);
		await user.click(screen.getByLabelText(/manager/i));
		const input = await screen.findByPlaceholderText(/search by name/i);
		await user.type(input, "ali");
		expect(screen.getByText("Alice Lim")).toBeInTheDocument();
		expect(screen.queryByText("Bob Tan")).not.toBeInTheDocument();
	});

	it("excludes IDs in excludeIds (cycle protection, existing test, adapted)", async () => {
		const user = userEvent.setup();
		render(
			<ManagerPicker
				value={null}
				excludeIds={["e2"]}
				options={options}
				onChange={() => {}}
			/>,
		);
		await user.click(screen.getByLabelText(/manager/i));
		// Wait for the list to render
		expect(await screen.findByText("Alice Lim")).toBeInTheDocument();
		expect(screen.queryByText("Bob Tan")).not.toBeInTheDocument();
	});

	it("calls onChange with id when an option is selected (existing test, adapted)", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<ManagerPicker
				value={null}
				excludeIds={[]}
				options={options}
				onChange={onChange}
			/>,
		);
		await user.click(screen.getByLabelText(/manager/i));
		await user.click(await screen.findByText("Alice Lim"));
		expect(onChange).toHaveBeenCalledWith("e1");
	});

	it("calls onChange(null) when (No manager) is picked", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<ManagerPicker
				value="e1"
				excludeIds={[]}
				options={options}
				onChange={onChange}
			/>,
		);
		await user.click(screen.getByLabelText(/manager/i));
		await user.click(await screen.findByText(/no manager/i));
		expect(onChange).toHaveBeenCalledWith(null);
	});
});
