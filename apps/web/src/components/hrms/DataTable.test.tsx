import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { type Column, DataTable } from "./DataTable";

interface Row {
	id: string;
	name: string;
	days: number;
}
const rows: Row[] = [
	{ id: "1", name: "Ops Lead", days: 3 },
	{ id: "2", name: "Eng Lead", days: 1 },
];
const columns: Column<Row>[] = [
	{ key: "name", header: "Name", render: (r) => r.name },
	{ key: "days", header: "Days", render: (r) => `${r.days}d`, sortable: true },
];

describe("DataTable", () => {
	it("renders header row and data rows", () => {
		render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />);
		expect(
			screen.getByRole("columnheader", { name: "Name" }),
		).toBeInTheDocument();
		expect(screen.getByText("Ops Lead")).toBeInTheDocument();
		expect(screen.getByText("Eng Lead")).toBeInTheDocument();
	});

	it("calls onRowClick when a row is clicked", async () => {
		const user = userEvent.setup();
		const onRowClick = vi.fn();
		render(
			<DataTable
				rows={rows}
				columns={columns}
				rowKey={(r) => r.id}
				onRowClick={onRowClick}
			/>,
		);
		await user.click(screen.getByText("Ops Lead"));
		expect(onRowClick).toHaveBeenCalledWith(rows[0]);
	});

	it("renders empty state when rows is []", () => {
		render(
			<DataTable
				rows={[]}
				columns={columns}
				rowKey={(r) => r.id}
				emptyState={<p>No data</p>}
			/>,
		);
		expect(screen.getByText("No data")).toBeInTheDocument();
	});

	it("toggles sort when sortable column header is clicked", async () => {
		const user = userEvent.setup();
		render(<DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />);
		await user.click(screen.getByRole("button", { name: /Days/ }));
		const cells = screen.getAllByText(/^\d+d$/);
		// after asc sort, "1d" first, "3d" second
		expect(cells[0]?.textContent).toBe("1d");
	});
});
