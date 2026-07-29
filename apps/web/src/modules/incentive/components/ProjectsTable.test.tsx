import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------------ mocks */

const projectsList = vi.hoisted(() => vi.fn());
const projectsUpdate = vi.hoisted(() => vi.fn());
const projectsClose = vi.hoisted(() => vi.fn());
const projectsReopen = vi.hoisted(() => vi.fn());

vi.mock("../api", () => ({
	incentiveApi: {
		projects: {
			list: projectsList,
			update: projectsUpdate,
			close: projectsClose,
			reopen: projectsReopen,
		},
	},
}));

const useCan = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/lib/perm", () => ({ useCan }));

import type { OverviewProject } from "../api";
import { ProjectsTable } from "./ProjectsTable";

/* ------------------------------------------------------------------ fixtures */

function makeProject(overrides: Partial<OverviewProject> = {}): OverviewProject {
	return {
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
		...overrides,
	};
}

// Full Project record returned by projects.list()
function makeFullProject(p: OverviewProject) {
	return {
		id: p.id,
		customer: "cust-1",
		customer_name: p.customer_name,
		name: p.name,
		description: "Test description",
		budget_mandays: p.budget,
		manager_id: p.manager_id,
		include_soc: p.include_soc,
		status: p.status,
		deadline: p.deadline,
		mandays_approved: "20",
		mandays_remaining: p.remaining,
		created_at: "2026-01-01T00:00:00Z",
	};
}

const BASE_PROJECTS: OverviewProject[] = [
	makeProject({ id: "p1", name: "Acme Pentest", budget: "40", deadline: null, status: "open" }),
	makeProject({
		id: "p2",
		name: "VAPT Audit",
		customer_name: "Initech",
		budget: "30",
		consumed: "30",
		remaining: "0",
		status: "closed",
		include_soc: false,
		deadline: null,
	}),
];

beforeEach(() => {
	vi.clearAllMocks();
	useCan.mockReturnValue(true);
	projectsList.mockResolvedValue(BASE_PROJECTS.map(makeFullProject));
	projectsUpdate.mockResolvedValue({});
	projectsClose.mockResolvedValue(undefined);
	projectsReopen.mockResolvedValue({});
});

/* ================================================================== tests */

describe("ProjectsTable", () => {
	/* ---- existing behaviour preserved ---- */

	it("renders both projects then filters by status", async () => {
		const user = userEvent.setup();
		render(<ProjectsTable projects={BASE_PROJECTS} />);
		expect(screen.getByText("Acme Pentest")).toBeInTheDocument();
		expect(screen.getByText("VAPT Audit")).toBeInTheDocument();
		await user.selectOptions(screen.getByLabelText("Status filter"), "closed");
		expect(screen.queryByText("Acme Pentest")).not.toBeInTheDocument();
		expect(screen.getByText("VAPT Audit")).toBeInTheDocument();
	});

	it("shows an empty state when nothing matches the search", async () => {
		const user = userEvent.setup();
		render(<ProjectsTable projects={BASE_PROJECTS} />);
		await user.type(screen.getByLabelText("Search projects"), "zzz");
		expect(screen.getByText("No projects match.")).toBeInTheDocument();
	});

	/* ---- sorting ---- */

	it("sorts by Budget asc then desc", async () => {
		const user = userEvent.setup();
		const projects: OverviewProject[] = [
			makeProject({ id: "p1", name: "Alpha", budget: "100" }),
			makeProject({ id: "p2", name: "Beta", budget: "20" }),
			makeProject({ id: "p3", name: "Gamma", budget: "55" }),
		];
		render(<ProjectsTable projects={projects} />);

		// Click Budget header → asc (20, 55, 100)
		const budgetBtn = screen.getByRole("button", { name: /Budget/i });
		await user.click(budgetBtn);

		const getCells = () =>
			screen
				.getAllByRole("cell")
				.filter((c) => ["20 md", "55 md", "100 md"].includes(c.textContent ?? ""));

		let cells = getCells();
		expect(cells[0].textContent).toBe("20 md");
		expect(cells[2].textContent).toBe("100 md");

		// Click again → desc (100, 55, 20)
		await user.click(budgetBtn);
		cells = getCells();
		expect(cells[0].textContent).toBe("100 md");
		expect(cells[2].textContent).toBe("20 md");
	});

	it("sorts by Deadline: nulls always last, non-nulls sorted asc then desc", async () => {
		const user = userEvent.setup();
		const projects: OverviewProject[] = [
			makeProject({ id: "p1", name: "NoDeadline", budget: "10", deadline: null }),
			makeProject({ id: "p2", name: "Later", budget: "10", deadline: "2026-12-01" }),
			makeProject({ id: "p3", name: "Sooner", budget: "10", deadline: "2026-06-01" }),
		];
		render(<ProjectsTable projects={projects} />);

		// Click Deadline header → asc (Sooner, Later, NoDeadline)
		const deadlineBtn = screen.getByRole("button", { name: /Deadline/i });
		await user.click(deadlineBtn);

		// Get project name cells only (first column cells)
		const getNameCells = () => {
			const rows = screen.getAllByRole("row").slice(1); // skip header
			return rows.map((row) => within(row).getAllByRole("cell")[0]);
		};

		let nameCells = getNameCells();
		expect(nameCells[0].textContent).toContain("Sooner");
		expect(nameCells[1].textContent).toContain("Later");
		expect(nameCells[2].textContent).toContain("NoDeadline");

		// Click again → desc (Later, Sooner, NoDeadline — nulls still last)
		await user.click(deadlineBtn);
		nameCells = getNameCells();
		expect(nameCells[0].textContent).toContain("Later");
		expect(nameCells[1].textContent).toContain("Sooner");
		expect(nameCells[2].textContent).toContain("NoDeadline");
	});

	/* ---- pagination ---- */

	it("paginates: 12 rows → Prev/Next navigation", async () => {
		const user = userEvent.setup();
		const many: OverviewProject[] = Array.from({ length: 12 }, (_, i) =>
			makeProject({ id: `p${i}`, name: `Project ${String(i + 1).padStart(2, "0")}` }),
		);
		render(<ProjectsTable projects={many} />);

		// Page 1: 1–10 of 12
		expect(screen.getByText("1–10 of 12")).toBeInTheDocument();
		expect(screen.queryByText("Project 11")).not.toBeInTheDocument();

		// Go to page 2
		await user.click(screen.getByRole("button", { name: /Next/i }));
		await waitFor(() => expect(screen.getByText("Project 11")).toBeInTheDocument());
		expect(screen.getByText("11–12 of 12")).toBeInTheDocument();
		expect(screen.queryByText("Project 01")).not.toBeInTheDocument();

		// Go back
		await user.click(screen.getByRole("button", { name: /Prev/i }));
		await waitFor(() => expect(screen.getByText("1–10 of 12")).toBeInTheDocument());
	});

	it("Prev is disabled on page 1, Next disabled on last page", async () => {
		const user = userEvent.setup();
		const many: OverviewProject[] = Array.from({ length: 11 }, (_, i) =>
			makeProject({ id: `p${i}`, name: `Proj ${i}` }),
		);
		render(<ProjectsTable projects={many} />);

		expect(screen.getByRole("button", { name: /Prev/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled();

		await user.click(screen.getByRole("button", { name: /Next/i }));
		await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled());
		expect(screen.getByRole("button", { name: /Prev/i })).not.toBeDisabled();
	});

	/* ---- actions column visibility ---- */

	it("shows Actions column when useCan returns true", () => {
		useCan.mockReturnValue(true);
		render(<ProjectsTable projects={BASE_PROJECTS} />);
		expect(screen.getByRole("columnheader", { name: /Actions/i })).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: /Edit/i }).length).toBeGreaterThan(0);
	});

	it("does not show Actions column when useCan returns false", () => {
		useCan.mockReturnValue(false);
		render(<ProjectsTable projects={BASE_PROJECTS} />);
		expect(screen.queryByRole("columnheader", { name: /Actions/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
	});

	it("shows Close for open rows and Reopen for closed rows", () => {
		useCan.mockReturnValue(true);
		render(<ProjectsTable projects={BASE_PROJECTS} />);
		expect(screen.getByRole("button", { name: /Close/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Reopen/i })).toBeInTheDocument();
	});

	/* ---- Close flow ---- */

	it("Close: opens ConfirmDialog (danger) → calls projects.close → onChanged", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		const openProject = makeProject({ id: "p1", name: "Acme Pentest", status: "open" });
		render(<ProjectsTable projects={[openProject]} onChanged={onChanged} />);

		// Click Close
		await user.click(screen.getByRole("button", { name: /Close/i }));

		// Confirm dialog
		await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
		const dialog = screen.getByRole("dialog");
		expect(
			within(dialog).getByText(/Closed projects stop accepting claims/i),
		).toBeInTheDocument();

		// Confirm — use the visible button text "Close" (not the sr-only × button)
		const confirmBtn = within(dialog)
			.getAllByRole("button", { name: /^Close$/i })
			.find((b) => !b.querySelector(".sr-only"));
		if (!confirmBtn) throw new Error("Close confirm button not found");
		await user.click(confirmBtn);
		await waitFor(() => expect(projectsClose).toHaveBeenCalledWith("p1"));
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
	});

	/* ---- Reopen flow ---- */

	it("Reopen: opens ConfirmDialog → calls projects.reopen → onChanged", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		const closedProject = makeProject({ id: "p2", name: "VAPT Audit", status: "closed" });
		render(<ProjectsTable projects={[closedProject]} onChanged={onChanged} />);

		await user.click(screen.getByRole("button", { name: /Reopen/i }));

		await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText(/Reopen project/i)).toBeInTheDocument();

		await user.click(within(dialog).getByRole("button", { name: /^Reopen$/i }));
		await waitFor(() => expect(projectsReopen).toHaveBeenCalledWith("p2"));
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
	});

	/* ---- Edit flow ---- */

	it("Edit: fetches full record, opens pre-filled modal, save calls projects.update → onChanged", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		const openProject = makeProject({ id: "p1", name: "Acme Pentest", status: "open", budget: "40" });
		const fullRecord = makeFullProject(openProject);
		projectsList.mockResolvedValue([fullRecord]);

		render(<ProjectsTable projects={[openProject]} onChanged={onChanged} />);

		// Click Edit
		await user.click(screen.getByRole("button", { name: /Edit/i }));

		// Modal opens with pre-filled values
		await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
		const dialog = screen.getByRole("dialog");

		const nameInput = within(dialog).getByLabelText("Project name") as HTMLInputElement;
		expect(nameInput.value).toBe("Acme Pentest");

		// Modify name
		await user.clear(nameInput);
		await user.type(nameInput, "Acme Pentest Updated");

		// Save
		await user.click(within(dialog).getByRole("button", { name: /Save changes/i }));
		await waitFor(() =>
			expect(projectsUpdate).toHaveBeenCalledWith(
				"p1",
				expect.objectContaining({ name: "Acme Pentest Updated" }),
			),
		);
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
	});

	it("Edit: customer shown read-only (not an editable input)", async () => {
		const user = userEvent.setup();
		const openProject = makeProject({ id: "p1", name: "Acme Pentest", customer_name: "Acme", status: "open" });
		const fullRecord = makeFullProject(openProject);
		projectsList.mockResolvedValue([fullRecord]);

		render(<ProjectsTable projects={[openProject]} onChanged={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: /Edit/i }));

		await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
		const dialog = screen.getByRole("dialog");

		// Customer name is displayed as text (not a select or editable input)
		expect(within(dialog).getByText("Acme")).toBeInTheDocument();
		expect(within(dialog).queryByLabelText("Customer")).not.toBeInTheDocument();
	});
});
