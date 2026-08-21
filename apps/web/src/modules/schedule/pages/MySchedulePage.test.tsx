import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { todayIsoLocal } from "../lib/local-date"

const mocks = vi.hoisted(() => ({
  myAssignments: vi.fn(),
  listShifts: vi.fn(),
  listHolidays: vi.fn(),
  today: vi.fn(),
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  listMyLeave: vi.fn(),
  listMySwaps: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@/modules/attendance/api", () => ({
  ApiError: class ApiError extends Error {
    status = 0
  },
  attendanceApi: { today: mocks.today, clockIn: mocks.clockIn, clockOut: mocks.clockOut },
}))
vi.mock("../api", () => ({
  scheduleApi: {
    myAssignments: mocks.myAssignments,
    listShifts: mocks.listShifts,
    listHolidays: mocks.listHolidays,
  },
}))
vi.mock("@/modules/leave/api", () => ({
  leaveApi: { listMyRequests: mocks.listMyLeave },
}))
vi.mock("../swap-api", () => ({
  listMySwapRequests: mocks.listMySwaps,
  listSwapCandidates: vi.fn().mockResolvedValue([]),
  createSwapRequest: vi.fn(),
  cancelSwapRequest: vi.fn(),
}))
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    perms: new Set([
      "attendance:clock:self",
      "schedule:swap:request:self",
      "leave:request:create:self",
    ]),
  }),
}))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))

import MySchedulePage from "./MySchedulePage"

const today = todayIsoLocal()

function renderPage() {
  render(
    <MemoryRouter>
      <MySchedulePage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset?.()
  mocks.myAssignments.mockResolvedValue([])
  mocks.listShifts.mockResolvedValue([])
  mocks.listHolidays.mockResolvedValue([])
  mocks.listMyLeave.mockResolvedValue([])
  mocks.listMySwaps.mockResolvedValue([])
  mocks.today.mockResolvedValue(null)
})

describe("MySchedulePage", () => {
  it("defaults to the month view and shows the hero", async () => {
    renderPage()
    expect(await screen.findByRole("tab", { name: /month/i })).toHaveAttribute(
      "data-state",
      "active",
    )
    expect(screen.getByTestId("hero-clock")).toBeInTheDocument()
  })

  it("fetches assignments for the visible range", async () => {
    renderPage()
    await waitFor(() => expect(mocks.myAssignments).toHaveBeenCalled())
    const [from, to] = mocks.myAssignments.mock.calls[0]
    expect(from <= today).toBe(true)
    expect(to >= today).toBe(true)
  })

  it("refetches when the view changes to week", async () => {
    // Fake timers with shouldAdvanceTime scoped to this test only — plain real
    // timers make userEvent clicks hang under this repo's happy-dom + vitest
    // combination, and leaving a lingering real timer behind bleeds into later
    // tests' microtask timing. Reset back to real timers before returning.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()
    await waitFor(() => expect(mocks.myAssignments).toHaveBeenCalled())
    mocks.myAssignments.mockClear()
    await user.click(screen.getByRole("tab", { name: /week/i }))
    await waitFor(() => expect(mocks.myAssignments).toHaveBeenCalled())
    vi.useRealTimers()
  })

  it("renders the calendar when holidays fail (decoupled fetch)", async () => {
    mocks.listHolidays.mockRejectedValue(new Error("boom"))
    renderPage()
    expect(await screen.findByRole("tab", { name: /month/i })).toBeInTheDocument()
    // findAllByTestId (not a synchronous getAllByTestId right after an unrelated
    // findByRole) — the calendar body only swaps out of its loading skeleton once
    // React commits the post-fetch state, which is not guaranteed to land within
    // the same microtask tick as the tab query above resolving.
    expect((await screen.findAllByTestId("month-cell")).length).toBeGreaterThan(0)
  })

  it("renders the calendar when own leave fails (decoupled fetch)", async () => {
    mocks.listMyLeave.mockRejectedValue(new Error("403"))
    renderPage()
    expect(await screen.findByRole("tab", { name: /month/i })).toBeInTheDocument()
    expect((await screen.findAllByTestId("month-cell")).length).toBeGreaterThan(0)
  })

  it("renders the calendar when swap requests fail (decoupled fetch)", async () => {
    mocks.listMySwaps.mockRejectedValue(new Error("boom"))
    renderPage()
    expect(await screen.findByRole("tab", { name: /month/i })).toBeInTheDocument()
  })

  it("toasts when the required assignments fetch fails", async () => {
    mocks.myAssignments.mockRejectedValue(new Error("Server exploded"))
    renderPage()
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
  })

  it("shows the not-linked empty state on a 404", async () => {
    const { ApiError } = await import("@/modules/attendance/api")
    const err = new ApiError("nope", 404)
    // The mocked ApiError above only declares `status = 0` as a field
    // initializer (no custom constructor), so the constructor arg above is
    // for TS's benefit only — set it explicitly for the mock to carry 404.
    err.status = 404
    mocks.myAssignments.mockRejectedValue(err)
    renderPage()
    expect(await screen.findByText(/isn't linked to an employee record/i)).toBeInTheDocument()
  })

  it("renders the rail cards", async () => {
    renderPage()
    expect(await screen.findByText("Upcoming holidays")).toBeInTheDocument()
    expect(screen.getByText("Quick actions")).toBeInTheDocument()
    expect(screen.getByText("Next 5 shifts")).toBeInTheDocument()
  })
})
