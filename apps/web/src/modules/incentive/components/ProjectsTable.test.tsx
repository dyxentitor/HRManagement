import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { OverviewProject } from "../api";
import { ProjectsTable } from "./ProjectsTable";

const projects: OverviewProject[] = [
	{
		id: "p1",
		name: "Acme Pentest",
		customer_name: "Acme",
		manager_id: "m1",
		budget: "40",
		consumed: "28",
		remaining: "12",
		status: "open",
		include_soc: true,
		deadline: null,
	},
	{
		id: "p2",
		name: "VAPT Audit",
		customer_name: "Initech",
		manager_id: "m2",
		budget: "30",
		consumed: "30",
		remaining: "0",
		status: "closed",
		include_soc: false,
		deadline: null,
	},
];

describe("ProjectsTable", () => {
	it("renders both projects then filters by status", async () => {
		const user = userEvent.setup();
		render(<ProjectsTable projects={projects} />);
		expect(screen.getByText("Acme Pentest")).toBeInTheDocument();
		expect(screen.getByText("VAPT Audit")).toBeInTheDocument();
		await user.selectOptions(screen.getByLabelText("Status filter"), "closed");
		expect(screen.queryByText("Acme Pentest")).not.toBeInTheDocument();
		expect(screen.getByText("VAPT Audit")).toBeInTheDocument();
	});

	it("shows an empty state when nothing matches the search", async () => {
		const user = userEvent.setup();
		render(<ProjectsTable projects={projects} />);
		await user.type(screen.getByLabelText("Search projects"), "zzz");
		expect(screen.getByText("No projects match.")).toBeInTheDocument();
	});
});
