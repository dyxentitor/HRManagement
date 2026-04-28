import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
	it("renders label and percentage", () => {
		render(<ProgressBar label="Attendance" value={88} max={100} />);
		expect(screen.getByText("Attendance")).toBeInTheDocument();
		expect(screen.getByText("88%")).toBeInTheDocument();
	});

	it("clamps over-100 values", () => {
		render(<ProgressBar value={150} max={100} />);
		const bar = screen.getByRole("progressbar");
		expect(bar.getAttribute("aria-valuenow")).toBe("100");
	});

	it("clamps negative values to 0", () => {
		render(<ProgressBar value={-5} max={100} />);
		const bar = screen.getByRole("progressbar");
		expect(bar.getAttribute("aria-valuenow")).toBe("0");
	});
});
