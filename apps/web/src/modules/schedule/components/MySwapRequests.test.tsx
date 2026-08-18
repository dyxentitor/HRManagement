import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MySwapRequests } from "./MySwapRequests"

const mocks = vi.hoisted(() => ({
	listMySwapRequests: vi.fn(),
	cancelSwapRequest: vi.fn(),
}))

vi.mock("../swap-api", () => ({
	listMySwapRequests: mocks.listMySwapRequests,
	cancelSwapRequest: mocks.cancelSwapRequest,
}))

const PENDING = {
	id: "r1",
	status: "pending",
	reason: "",
	decision_note: "",
	created_at: "2026-08-18T10:00:00Z",
	requester_name: "Lim Min Wei",
	counterparty_name: "Esther Bala",
	requester_assignment: {
		id: "a1", employee: "e1", employee_code: "E1", employee_name: "Lim Min Wei",
		shift: "s1", shift_name: "Night", shift_code: "N", work_date: "2026-09-01",
	},
	counterparty_assignment: {
		id: "a2", employee: "e2", employee_code: "E2", employee_name: "Esther Bala",
		shift: "s2", shift_name: "Day", shift_code: "D", work_date: "2026-09-03",
	},
}

describe("MySwapRequests", () => {
	beforeEach(() => {
		mocks.listMySwapRequests.mockReset().mockResolvedValue([PENDING])
		mocks.cancelSwapRequest.mockReset().mockResolvedValue(undefined)
	})

	it("renders nothing when there are no requests", async () => {
		mocks.listMySwapRequests.mockResolvedValue([])
		const { container } = render(<MySwapRequests refreshKey={0} onChanged={vi.fn()} />)
		await waitFor(() => expect(mocks.listMySwapRequests).toHaveBeenCalled())
		expect(container).toBeEmptyDOMElement()
	})

	it("lists a pending swap with the counterparty and both slots", async () => {
		render(<MySwapRequests refreshKey={0} onChanged={vi.fn()} />)
		expect(await screen.findByText(/Esther Bala/)).toBeInTheDocument()
		expect(screen.getByText(/Night/)).toBeInTheDocument()
		expect(screen.getByText(/Day/)).toBeInTheDocument()
	})

	it("cancels a pending request", async () => {
		const onChanged = vi.fn()
		render(<MySwapRequests refreshKey={0} onChanged={onChanged} />)
		await userEvent.click(await screen.findByRole("button", { name: /cancel/i }))
		await waitFor(() => expect(mocks.cancelSwapRequest).toHaveBeenCalledWith("r1"))
		expect(onChanged).toHaveBeenCalled()
	})

	it("offers no cancel action on a decided request", async () => {
		mocks.listMySwapRequests.mockResolvedValue([{ ...PENDING, status: "approved" }])
		render(<MySwapRequests refreshKey={0} onChanged={vi.fn()} />)
		await screen.findByText(/Esther Bala/)
		expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument()
	})
})
