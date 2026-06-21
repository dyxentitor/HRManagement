import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const emp = vi.hoisted(() => ({ getMe: vi.fn(), updateMe: vi.fn() }));
vi.mock("@/modules/employee/api", () => ({ employeeApi: emp }));
vi.mock("@/modules/employee/components/AvatarUpload", () => ({
	AvatarUpload: () => <div data-testid="avatar" />,
}));

import { ProfileStep } from "./ProfileStep";
import type { StepCtx } from "./types";

function ctx(over: Partial<StepCtx> = {}): StepCtx {
	return {
		mode: "activate",
		token: "",
		preview: null,
		goNext: vi.fn(),
		goBack: vi.fn(),
		goTo: vi.fn(),
		finish: vi.fn(),
		markSaved: vi.fn(),
		...over,
	};
}

beforeEach(() => {
	emp.getMe.mockReset();
	emp.updateMe.mockReset();
});

describe("ProfileStep", () => {
	it("renders the contact form when the user has an employee profile", async () => {
		emp.getMe.mockResolvedValue({ full_name: "Aisyah", phone: "+60123" });
		render(<ProfileStep ctx={ctx()} />);
		await waitFor(() => expect(screen.getByText(/Tell us how to reach you/i)).toBeInTheDocument());
		expect(screen.getByText("Emergency contact")).toBeInTheDocument();
	});

	it("does NOT hang when the account has no linked employee (getMe → null)", async () => {
		emp.getMe.mockResolvedValue(null);
		const goNext = vi.fn();
		render(<ProfileStep ctx={ctx({ goNext })} />);
		await waitFor(() =>
			expect(screen.getByText(/still setting up your employee profile/i)).toBeInTheDocument(),
		);
		// continueable — not stuck on a skeleton
		expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
	});

	it("stays continueable when getMe errors", async () => {
		emp.getMe.mockRejectedValue(new Error("boom"));
		render(<ProfileStep ctx={ctx()} />);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument(),
		);
	});
});
