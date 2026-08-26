import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Shift } from "../api"
import { SwapRequestDrawer, type SwapSourceShift } from "./SwapRequestDrawer"

const mocks = vi.hoisted(() => ({
  listSwapCandidates: vi.fn(),
  createSwapRequest: vi.fn(),
}))

vi.mock("../swap-api", () => ({
  listSwapCandidates: mocks.listSwapCandidates,
  createSwapRequest: mocks.createSwapRequest,
}))

function candidate(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    employee: "e2",
    employee_code: "E2",
    employee_name: "Esther Bala",
    shift: "s-day",
    shift_name: "Day",
    shift_code: "D",
    shift_start: "09:00:00",
    shift_end: "18:00:00",
    shift_crosses_midnight: false,
    work_date: "2026-09-03",
    department_name: "Ops",
    team_name: null,
    compatible: true,
    incompatible_reason: null,
    warnings: [],
    ...over,
  }
}

function page(results: ReturnType<typeof candidate>[], over: Record<string, unknown> = {}) {
  return {
    results,
    count: results.length,
    page: 1,
    page_size: 8,
    blocked_reason: null,
    ...over,
  }
}

const SOURCES: SwapSourceShift[] = [
  {
    assignmentId: "a1",
    date: "2026-09-01",
    shiftName: "Night",
    shiftCode: "N",
    timeRange: "21:00–06:00",
    hours: 9,
  },
  {
    assignmentId: "a2",
    date: "2026-09-05",
    shiftName: "Day",
    shiftCode: "D",
    timeRange: "09:00–18:00",
    hours: 9,
  },
]

const SHIFTS = [
  { id: "s-day", name: "Day", code: "D" },
  { id: "s-night", name: "Night", code: "N" },
] as unknown as Shift[]

function renderDrawer(over: Partial<Parameters<typeof SwapRequestDrawer>[0]> = {}) {
  const props = {
    open: true,
    assignmentId: "a1",
    sources: SOURCES,
    shifts: SHIFTS,
    onClose: vi.fn(),
    onCreated: vi.fn(),
    ...over,
  }
  render(<SwapRequestDrawer {...props} />)
  return props
}

/** Walk from step 1 to the candidate picker. */
async function gotoPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /continue/i }))
  return screen.findByText(/Esther Bala/)
}

describe("SwapRequestDrawer", () => {
  beforeEach(() => {
    mocks.listSwapCandidates.mockReset().mockResolvedValue(page([candidate()]))
    mocks.createSwapRequest.mockReset().mockResolvedValue({ id: "r1" })
  })

  it("preselects the shift the request was launched from", () => {
    renderDrawer()
    expect(screen.getByRole("radio", { name: /Night/ })).toBeChecked()
  })

  it("does not fetch candidates until the picker step is reached", async () => {
    const user = userEvent.setup()
    renderDrawer()
    expect(mocks.listSwapCandidates).not.toHaveBeenCalled()

    await gotoPicker(user)

    expect(mocks.listSwapCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ assignmentId: "a1", pageSize: 8 }),
    )
  })

  it("submits the chosen pair after an explicit confirmation", async () => {
    const user = userEvent.setup()
    const props = renderDrawer()

    await gotoPicker(user)
    await user.click(screen.getByRole("button", { name: /Esther Bala/ }))
    await user.click(screen.getByRole("button", { name: /continue/i }))

    // The submit button stays disabled until the confirmation is ticked.
    const send = screen.getByRole("button", { name: /send request/i })
    expect(send).toBeDisabled()
    await user.click(screen.getByRole("checkbox"))
    await user.click(send)

    await waitFor(() =>
      expect(mocks.createSwapRequest).toHaveBeenCalledWith({
        requesterAssignmentId: "a1",
        counterpartyAssignmentId: "c1",
        reason: "",
      }),
    )
    expect(props.onCreated).toHaveBeenCalled()
  })

  it("refetches against the new source when the source shift is changed", async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(screen.getByRole("radio", { name: /Day/ }))
    await gotoPicker(user)

    expect(mocks.listSwapCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ assignmentId: "a2" }),
    )
  })

  it("blocks selecting an incompatible candidate and shows why", async () => {
    mocks.listSwapCandidates.mockResolvedValue(
      page([
        candidate({
          compatible: false,
          incompatible_reason: "E1 is already rostered on 2026-09-03 (Day). Swap not possible.",
        }),
      ]),
    )
    const user = userEvent.setup()
    renderDrawer()

    await gotoPicker(user)

    expect(screen.getByRole("button", { name: /Esther Bala/ })).toBeDisabled()
    expect(screen.getByText(/already rostered/)).toBeInTheDocument()
  })

  it("loads further pages incrementally instead of all at once", async () => {
    mocks.listSwapCandidates.mockResolvedValueOnce(
      page([candidate()], { count: 2, page: 1, page_size: 1 }),
    )
    const user = userEvent.setup()
    renderDrawer()
    await gotoPicker(user)

    mocks.listSwapCandidates.mockResolvedValueOnce(
      page([candidate({ id: "c2", employee_name: "Nurul Aina" })], {
        count: 2,
        page: 2,
        page_size: 1,
      }),
    )
    await user.click(screen.getByRole("button", { name: /load .* more/i }))

    expect(await screen.findByText(/Nurul Aina/)).toBeInTheDocument()
    // The first page is appended to, not replaced.
    expect(screen.getByText(/Esther Bala/)).toBeInTheDocument()
    expect(mocks.listSwapCandidates).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })

  it("surfaces a candidate-search failure without losing the drawer", async () => {
    mocks.listSwapCandidates.mockRejectedValue(new Error("Could not load teammates"))
    const user = userEvent.setup()
    renderDrawer()

    await user.click(screen.getByRole("button", { name: /continue/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load teammates/)
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument()
  })

  it("returns to the picker with the server's reason when submit is refused", async () => {
    mocks.createSwapRequest.mockRejectedValue(
      new Error("E1 is already rostered on 2026-09-03 (Day). Swap not possible."),
    )
    const user = userEvent.setup()
    renderDrawer()

    await gotoPicker(user)
    await user.click(screen.getByRole("button", { name: /Esther Bala/ }))
    await user.click(screen.getByRole("button", { name: /continue/i }))
    await user.click(screen.getByRole("checkbox"))
    await user.click(screen.getByRole("button", { name: /send request/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/already rostered/)
    // Back on the picker so the choice can be corrected, not stranded on review.
    expect(screen.getByLabelText(/search for a colleague/i)).toBeInTheDocument()
  })

  it("compares both shifts on the review step", async () => {
    const user = userEvent.setup()
    renderDrawer()

    await gotoPicker(user)
    await user.click(screen.getByRole("button", { name: /Esther Bala/ }))
    await user.click(screen.getByRole("button", { name: /continue/i }))

    const current = screen.getByText(/You currently work/).closest("div") as HTMLElement
    expect(within(current).getByText(/Night/)).toBeInTheDocument()
    const replacement = screen.getByText(/You would work instead/).closest("div") as HTMLElement
    expect(within(replacement).getByText(/Esther Bala/)).toBeInTheDocument()
    expect(screen.getByText(/Your manager, for approval/)).toBeInTheDocument()
  })

  it("offers no coverage option — the backend only supports reciprocal swaps", async () => {
    const user = userEvent.setup()
    renderDrawer()
    await gotoPicker(user)

    expect(screen.queryByText(/find cover/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/giving up/i)).not.toBeInTheDocument()
  })
})
