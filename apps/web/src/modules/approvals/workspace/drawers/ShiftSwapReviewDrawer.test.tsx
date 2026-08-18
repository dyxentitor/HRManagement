import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ShiftSwapReviewDrawer } from "./ShiftSwapReviewDrawer"

const mocks = vi.hoisted(() => ({
  approveItem: vi.fn(),
  rejectItem: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock("../../api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  approveItem: mocks.approveItem,
  rejectItem: mocks.rejectItem,
}))

vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }))

const ITEM = {
  kind: "shift_swap" as const,
  id: "r1",
  employee_code: "E1",
  summary: "swap",
  submitted_at: "2026-08-18T10:00:00Z",
  deep_link: "/approvals?focus=r1",
  employee_id: "e1",
  name: "Lim Min Wei",
  department: "Operations",
  type_code: "SWAP",
  detail: {
    requester_date: "2026-09-01",
    requester_shift: "Night",
    counterparty_name: "Esther Bala",
    counterparty_date: "2026-09-03",
    counterparty_shift: "Day",
    reason: "family event",
  },
}

describe("ShiftSwapReviewDrawer", () => {
  beforeEach(() => {
    mocks.approveItem.mockReset().mockResolvedValue(undefined)
    mocks.rejectItem.mockReset().mockResolvedValue(undefined)
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
  })

  it("shows both sides of the swap", () => {
    render(<ShiftSwapReviewDrawer item={ITEM} onClose={vi.fn()} onActed={vi.fn()} />)
    expect(screen.getByText(/Lim Min Wei/)).toBeInTheDocument()
    expect(screen.getByText(/Esther Bala/)).toBeInTheDocument()
    expect(screen.getByText(/Night/)).toBeInTheDocument()
    expect(screen.getByText(/Day/)).toBeInTheDocument()
    expect(screen.getByText(/family event/)).toBeInTheDocument()
  })

  it("approves via the shift_swap kind", async () => {
    const onActed = vi.fn()
    render(<ShiftSwapReviewDrawer item={ITEM} onClose={vi.fn()} onActed={onActed} />)
    await userEvent.click(screen.getByRole("button", { name: /approve/i }))
    await waitFor(() => expect(mocks.approveItem).toHaveBeenCalledWith("shift_swap", "r1", ""))
    expect(onActed).toHaveBeenCalled()
  })

  it("rejects with the entered note", async () => {
    const onActed = vi.fn()
    render(<ShiftSwapReviewDrawer item={ITEM} onClose={vi.fn()} onActed={onActed} />)
    await userEvent.type(screen.getByLabelText(/note/i), "approved by manager")
    await userEvent.click(screen.getByRole("button", { name: /reject/i }))
    await waitFor(() =>
      expect(mocks.rejectItem).toHaveBeenCalledWith("shift_swap", "r1", "approved by manager"),
    )
    expect(onActed).toHaveBeenCalled()
  })

  it("refuses to reject without a reason", async () => {
    const onActed = vi.fn()
    render(<ShiftSwapReviewDrawer item={ITEM} onClose={vi.fn()} onActed={onActed} />)
    await userEvent.click(screen.getByRole("button", { name: /reject/i }))
    expect(mocks.rejectItem).not.toHaveBeenCalled()
    expect(onActed).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith("A reason is required to reject")
  })
})
