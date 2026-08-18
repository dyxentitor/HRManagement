import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SwapRequestDrawer } from "./SwapRequestDrawer"

const mocks = vi.hoisted(() => ({
  listSwapCandidates: vi.fn(),
  createSwapRequest: vi.fn(),
}))

vi.mock("../swap-api", () => ({
  listSwapCandidates: mocks.listSwapCandidates,
  createSwapRequest: mocks.createSwapRequest,
}))

const CANDIDATE = {
  id: "c1",
  employee: "e2",
  employee_code: "E2",
  employee_name: "Esther Bala",
  shift: "s-day",
  shift_name: "Day",
  shift_code: "D",
  work_date: "2026-09-03",
}

function renderDrawer() {
  return render(
    <SwapRequestDrawer
      assignmentId="a1"
      myDateLabel="1 Sep 2026"
      myShiftLabel="Night"
      onClose={vi.fn()}
      onCreated={vi.fn()}
    />,
  )
}

describe("SwapRequestDrawer", () => {
  beforeEach(() => {
    mocks.listSwapCandidates.mockReset().mockResolvedValue([CANDIDATE])
    mocks.createSwapRequest.mockReset().mockResolvedValue({ id: "r1" })
  })

  it("lists teammate shifts to swap with", async () => {
    renderDrawer()
    expect(await screen.findByText(/Esther Bala/)).toBeInTheDocument()
    expect(screen.getByText(/Day/)).toBeInTheDocument()
    const expectedDate = new Date(`${CANDIDATE.work_date}T00:00:00Z`).toLocaleDateString("en-MY", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
    expect(screen.getByText(new RegExp(expectedDate))).toBeInTheDocument()
  })

  it("shows a loading placeholder before fetch resolves and empty state after resolving empty", async () => {
    let resolve!: (value: never[]) => void
    mocks.listSwapCandidates.mockReturnValue(
      new Promise<never[]>((res) => {
        resolve = res
      }),
    )
    renderDrawer()
    expect(screen.queryByText(/No teammate shifts available/)).not.toBeInTheDocument()
    expect(screen.getByText(/Loading teammate shifts/)).toBeInTheDocument()
    resolve([])
    await waitFor(() =>
      expect(screen.getByText(/No teammate shifts available/)).toBeInTheDocument(),
    )
    expect(screen.queryByText(/Loading teammate shifts/)).not.toBeInTheDocument()
  })

  it("submits the selected pair", async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(await screen.findByRole("radio", { name: /Esther Bala/ }))
    await user.click(screen.getByRole("button", { name: /request swap/i }))

    await waitFor(() =>
      expect(mocks.createSwapRequest).toHaveBeenCalledWith({
        requesterAssignmentId: "a1",
        counterpartyAssignmentId: "c1",
        reason: "",
      }),
    )
  })

  it("shows the backend rejection reason", async () => {
    const user = userEvent.setup()
    mocks.createSwapRequest.mockRejectedValue(
      new Error("E1 is already rostered on 2026-09-03 (Day). Swap not possible."),
    )
    renderDrawer()

    await user.click(await screen.findByRole("radio", { name: /Esther Bala/ }))
    await user.click(screen.getByRole("button", { name: /request swap/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/already rostered/)
  })

  it("disables submit until a teammate shift is chosen", async () => {
    renderDrawer()
    await screen.findByText(/Esther Bala/)
    expect(screen.getByRole("button", { name: /request swap/i })).toBeDisabled()
  })
})
