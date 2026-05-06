import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ManagerPicker } from "./ManagerPicker";

const options = [
	{ id: "e1", full_name: "Alice Lim", role_title: "Eng Lead" },
	{ id: "e2", full_name: "Bob Tan", role_title: "Engineer" },
	{ id: "e3", full_name: "Carol Wong", role_title: "Engineer" },
];

describe("ManagerPicker", () => {
	it("filters by typed text", async () => {
		const user = userEvent.setup();
		render(
			<ManagerPicker
				value={null}
				excludeIds={[]}
				options={options}
				onChange={() => {}}
			/>,
		);
		const combo = screen.getByLabelText(/manager/i);
		await user.click(combo);
		await user.type(combo, "ali");
		expect(screen.getByText("Alice Lim")).toBeInTheDocument();
		expect(screen.queryByText("Bob Tan")).not.toBeInTheDocument();
	});

	it("excludes IDs in excludeIds (cycle protection)", async () => {
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
		expect(screen.queryByText("Bob Tan")).not.toBeInTheDocument();
	});

	it("calls onChange with id when an option is selected", async () => {
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
		await user.click(screen.getByText("Alice Lim"));
		expect(onChange).toHaveBeenCalledWith("e1");
	});
});
