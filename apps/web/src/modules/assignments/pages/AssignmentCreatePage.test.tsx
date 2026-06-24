import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/perm", () => ({ useCan: (p: string) => p === "assignment:read:org" }));
vi.mock("@/modules/employee/api", () => ({ employeeApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => vi.fn(),
}));
const api = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../api", () => ({ assignmentsApi: api }));

import AssignmentCreatePage from "./AssignmentCreatePage";

beforeEach(() => {
	api.create.mockReset().mockResolvedValue({ id: "a2" });
});

function renderPage() {
	render(
		<MemoryRouter>
			<AssignmentCreatePage />
		</MemoryRouter>,
	);
}

describe("AssignmentCreatePage", () => {
	it("publishes a task to everyone with the chosen type", async () => {
		const user = userEvent.setup();
		renderPage();
		await user.type(screen.getByLabelText(/^title/i), "Acknowledge handbook");
		await user.click(screen.getByRole("button", { name: /Acknowledge.*Read a policy/i }));
		await user.click(screen.getByRole("button", { name: /publish assignment/i }));
		await waitFor(() => expect(api.create).toHaveBeenCalled());
		expect(api.create.mock.calls[0][0]).toMatchObject({
			title: "Acknowledge handbook",
			type: "acknowledge",
			target: { kind: "org", ids: [] },
		});
	});

	it("reveals the question builder for questionnaires", async () => {
		const user = userEvent.setup();
		renderPage();
		await user.click(screen.getByRole("button", { name: /Questionnaire.*Collect answers/i }));
		expect(screen.getByText("Questions")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: /add question/i }));
		expect(screen.getByPlaceholderText("Question text")).toBeInTheDocument();
	});
});
