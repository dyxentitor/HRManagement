import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ questionnaire: vi.fn(), submit: vi.fn() }));
vi.mock("../api", () => ({ assignmentsApi: api }));
vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => vi.fn(),
	useParams: () => ({ id: "a1" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import QuestionnairePage from "./QuestionnairePage";

beforeEach(() => {
	api.questionnaire.mockReset();
	api.submit.mockReset().mockResolvedValue({});
	api.questionnaire.mockResolvedValue({
		assignment: { id: "a1", title: "Survey", description: "" },
		completed: false,
		questions: [
			{
				id: "q1",
				order: 0,
				text: "Fav language?",
				qtype: "single_choice",
				options: ["Py", "TS"],
				required: true,
			},
		],
	});
});

describe("QuestionnairePage", () => {
	it("renders questions and submits answers", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<QuestionnairePage />
			</MemoryRouter>,
		);
		await waitFor(() => expect(screen.getByText("Fav language?")).toBeInTheDocument());
		await user.click(screen.getByRole("button", { name: "Py" }));
		await user.click(screen.getByRole("button", { name: /^submit$/i }));
		await waitFor(() => expect(api.submit).toHaveBeenCalledWith("a1", { q1: "Py" }));
	});
});
