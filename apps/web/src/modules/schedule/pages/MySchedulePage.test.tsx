import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { addDaysIso, todayIsoLocal } from "../lib/local-date"
import { addMonthsIso } from "../lib/schedule-range"

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

function assignment(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "a1",
    employee: "e1",
    employee_code: "E1",
    shift: "s1",
    shift_name: "Day Shift",
    shift_code: "D",
    covering_for: null,
    covering_for_name: null,
    work_date: today,
    status: "scheduled",
    published_at: "2026-01-01T00:00:00Z",
    is_published: true,
    notes: "",
    ...over,
  }
}

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

  it("keeps headlining today's shift after the anchor moves to a different month", async () => {
    // Every myAssignments call (range fetch AND the horizon fetch) sees the
    // same today-dated shift, so navigating away must not lose it from the
    // hero — the hero reads from the horizon model, not the range-scoped one.
    mocks.myAssignments.mockResolvedValue([assignment()])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()
    expect(await screen.findByRole("heading", { name: /Day Shift/i })).toBeInTheDocument()
    const callsBefore = mocks.myAssignments.mock.calls.length
    await user.click(screen.getByRole("button", { name: /next month/i }))
    await waitFor(() => expect(mocks.myAssignments.mock.calls.length).toBeGreaterThan(callsBefore))
    expect(screen.getByRole("heading", { name: /Day Shift/i })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it("keeps listing upcoming shifts after the anchor moves to a different month", async () => {
    const future = addDaysIso(today, 3)
    mocks.myAssignments.mockResolvedValue([assignment({ id: "a2", work_date: future })])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()
    await waitFor(() =>
      expect(screen.getAllByTestId("upcoming-shift-row").length).toBeGreaterThan(0),
    )
    const callsBefore = mocks.myAssignments.mock.calls.length
    await user.click(screen.getByRole("button", { name: /next month/i }))
    await waitFor(() => expect(mocks.myAssignments.mock.calls.length).toBeGreaterThan(callsBefore))
    expect(screen.getAllByTestId("upcoming-shift-row").length).toBeGreaterThan(0)
    vi.useRealTimers()
  })

  it("renders the calendar when the forward-looking horizon fetch fails (decoupled fetch)", async () => {
    // The required range fetch (called first, on mount) succeeds; the
    // horizon fetch (called second, from its own independent effect) fails.
    mocks.myAssignments.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("boom"))
    renderPage()
    expect(await screen.findByRole("tab", { name: /month/i })).toBeInTheDocument()
    expect((await screen.findAllByTestId("month-cell")).length).toBeGreaterThan(0)
  })

  it("keeps the KPI row range-scoped when the anchor changes", async () => {
    // A shift that only exists on the 1st of *next* calendar month must not
    // show up in this month's KPI count, and the KPI row must change once
    // that month comes into view — guards against over-correcting the KPI
    // row onto the horizon model too.
    const future = addMonthsIso(today, 1)
    mocks.myAssignments.mockImplementation((from: string, to: string) =>
      Promise.resolve(
        from <= future && future <= to ? [assignment({ id: "a3", work_date: future })] : [],
      ),
    )
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()
    // The KPI row is skeleton-gated until the first load completes (item 3
    // of the fix wave) — wait for the real tile, not the skeleton, before
    // reading its baseline text.
    const before = (await screen.findByTestId("kpi-shifts")).textContent
    await user.click(screen.getByRole("button", { name: /next month/i }))
    await waitFor(() => expect(screen.getByTestId("kpi-shifts").textContent).not.toBe(before))
    vi.useRealTimers()
  })

  it("prefers the range model over the horizon when the horizon fetch blips but the range fetch has today's shift", async () => {
    // The required range fetch (called first, on mount) succeeds with a
    // today-dated shift; the horizon fetch (called second, from its own
    // independent effect) fails. The hero must show the shift, not
    // contradict the calendar by claiming "No shift scheduled".
    mocks.myAssignments
      .mockResolvedValueOnce([assignment()])
      .mockRejectedValueOnce(new Error("blip"))
    renderPage()
    expect(await screen.findByRole("heading", { name: /Day Shift/i })).toBeInTheDocument()
    expect(screen.queryByText(/No shift scheduled/i)).not.toBeInTheDocument()
  })

  it("shows skeleton placeholders for the KPI row and rail until the first load completes", async () => {
    mocks.myAssignments.mockImplementation(() => new Promise(() => {})) // never resolves
    const { container } = render(
      <MemoryRouter>
        <MySchedulePage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(mocks.myAssignments).toHaveBeenCalled())
    // hero (1) + 5 KPI tiles + rail (1) = 7 skeleton blocks while nothing has loaded.
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(7)
    expect(screen.queryByText("No upcoming shifts in this range.")).not.toBeInTheDocument()
    expect(screen.queryByText(/No upcoming shift is eligible for a swap/i)).not.toBeInTheDocument()
  })

  it("defaults to Agenda when the viewport is narrower than sm (spec §11)", async () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("639"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia
    try {
      renderPage()
      expect(await screen.findByRole("tab", { name: /agenda/i })).toHaveAttribute(
        "data-state",
        "active",
      )
    } finally {
      window.matchMedia = original
    }
  })

  it("always fetches holidays for the current and next year, even without navigating", async () => {
    renderPage()
    await waitFor(() => expect(mocks.listHolidays).toHaveBeenCalled())
    const years = mocks.listHolidays.mock.calls.map((c) => c[0])
    const currentYear = Number(today.slice(0, 4))
    expect(years).toContain(currentYear)
    expect(years).toContain(currentYear + 1)
  })

  it("does not let a slow, superseded range response overwrite a newer one after rapid nav clicks", async () => {
    // The first two calls (initial mount's range fetch + horizon fetch)
    // resolve immediately and empty. Every call after that (triggered by the
    // two "Next month" clicks below) hangs until this test resolves it by
    // hand, so the test controls resolution order independent of request
    // order — simulating two responses landing out of sequence.
    let callCount = 0
    const pending: Array<(v: unknown[]) => void> = []
    mocks.myAssignments.mockImplementation(() => {
      callCount += 1
      if (callCount <= 2) return Promise.resolve([])
      return new Promise((resolve) => pending.push(resolve))
    })

    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()
    await waitFor(() => expect(mocks.myAssignments).toHaveBeenCalledTimes(2))

    await user.click(screen.getByRole("button", { name: /next month/i }))
    await waitFor(() => expect(pending.length).toBe(1))
    await user.click(screen.getByRole("button", { name: /next month/i }))
    await waitFor(() => expect(pending.length).toBe(2))

    const staleAssignment = assignment({ id: "stale", work_date: addMonthsIso(today, 1) })
    const newestAssignment = assignment({ id: "newest", work_date: addMonthsIso(today, 2) })

    // Resolve the NEWER request (2nd click, index 1) first, then the STALE
    // one (1st click, index 0) — out of order, as a slow network can do.
    pending[1]([newestAssignment])
    await waitFor(() => expect(screen.getByTestId("kpi-shifts").textContent).toMatch(/1/))
    pending[0]([staleAssignment])

    // The late-arriving stale response must be a no-op: the KPI row must
    // keep reflecting the newest (currently-anchored) month's data, not
    // silently drop to 0 because September's assignment got applied under
    // October's already-rendered label.
    await waitFor(() => expect(mocks.myAssignments).toHaveBeenCalledTimes(4))
    expect(screen.getByTestId("kpi-shifts").textContent).toMatch(/1/)

    vi.useRealTimers()
  })
})
