import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ nextCode: vi.fn() }));
vi.mock("@/modules/employee/api", () => ({ employeeApi: api }));

import { EmployeeCodeField } from "./EmployeeCodeField";

function Harness({ mode }: { mode: "create" | "edit" }) {
	const [v, setV] = useState(mode === "edit" ? "EMP-2026-0003" : "");
	return <EmployeeCodeField value={v} onChange={setV} mode={mode} />;
}

beforeEach(() => {
	api.nextCode.mockReset().mockResolvedValue({ code: "EMP-2026-0007", autofill: true });
});

describe("EmployeeCodeField", () => {
	it("pre-fills on mount in create mode", async () => {
		render(<Harness mode="create" />);
		await waitFor(() =>
			expect(screen.getByLabelText(/^employee code$/i)).toHaveValue("EMP-2026-0007"),
		);
	});

	it("skips pre-fill when autofill is off but ↻ still generates", async () => {
		api.nextCode.mockResolvedValue({ code: "EMP-2026-0007", autofill: false });
		const user = userEvent.setup();
		render(<Harness mode="create" />);
		await new Promise((r) => setTimeout(r, 0));
		expect(screen.getByLabelText(/^employee code$/i)).toHaveValue("");
		await user.click(screen.getByRole("button", { name: /regenerate code/i }));
		await waitFor(() =>
			expect(screen.getByLabelText(/^employee code$/i)).toHaveValue("EMP-2026-0007"),
		);
	});

	it("keeps the existing code in edit mode but allows regenerate", async () => {
		const user = userEvent.setup();
		render(<Harness mode="edit" />);
		expect(screen.getByLabelText(/^employee code$/i)).toHaveValue("EMP-2026-0003");
		await user.click(screen.getByRole("button", { name: /regenerate code/i }));
		await waitFor(() =>
			expect(screen.getByLabelText(/^employee code$/i)).toHaveValue("EMP-2026-0007"),
		);
	});
});
