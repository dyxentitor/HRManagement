import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { openCommandPalette } from "@/lib/cmdk";

const mocks = vi.hoisted(() => ({
	can: () => true,
	list: vi.fn(),
}));

vi.mock("@/lib/perm", () => ({ useCan: () => mocks.can() }));
vi.mock("@/modules/employee/api", () => ({
	employeeApi: { list: mocks.list, getMe: vi.fn() },
}));

import { CommandPalette } from "./CommandPalette";

function renderPalette() {
	return render(
		<MemoryRouter>
			<CommandPalette />
		</MemoryRouter>,
	);
}

describe("CommandPalette", () => {
	it("opens via the openCommandPalette() helper", async () => {
		mocks.list.mockResolvedValue([]);
		renderPalette();
		openCommandPalette();
		expect(
			await screen.findByPlaceholderText(/Search pages/i),
		).toBeInTheDocument();
	});

	it("groups results into Pages and Actions", async () => {
		mocks.list.mockResolvedValue([]);
		renderPalette();
		openCommandPalette();
		expect(await screen.findByText(/^Pages$/)).toBeInTheDocument();
		expect(screen.getByText(/^Actions$/)).toBeInTheDocument();
	});

	it("loads and renders employee items when palette is opened", async () => {
		mocks.list.mockResolvedValue([
			{ id: "1", full_name: "Ops Lead", email: "ops@provintell.local" },
			{ id: "2", full_name: "Eng Lead", email: "eng@provintell.local" },
		]);
		renderPalette();
		openCommandPalette();
		await waitFor(() => {
			expect(screen.getByText(/^Employees$/)).toBeInTheDocument();
		});
		expect(screen.getByText("Ops Lead")).toBeInTheDocument();
	});
});
