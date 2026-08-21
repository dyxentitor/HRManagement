import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DayModel } from "../lib/day-model"
import { ScheduleHero } from "./ScheduleHero"

function day(over: Partial<DayModel> = {}): DayModel {
  return {
    date: "2026-08-21",
    isToday: true,
    isWeekend: false,
    inAnchorMonth: true,
    holidayName: null,
    leaveTypeCode: null,
    hasPendingSwap: false,
    shift: {
      assignmentId: "a1",
      name: "Day Shift",
      code: "D",
      tone: "sky",
      timeRange: "09:00–18:00",
      hours: 9,
      crossesMidnight: false,
      endsOn: null,
      coveringForName: null,
    },
    swapEligibility: { canSwap: false, reason: null },
    ...over,
  }
}

function renderHero(over: Partial<Parameters<typeof ScheduleHero>[0]> = {}) {
  const props = {
    today: day(),
    clockState: { status: "off" } as const,
    statusLabel: "No record",
    canClock: true,
    busy: false,
    onClockIn: vi.fn(),
    onClockOut: vi.fn(),
    ...over,
  }
  render(<ScheduleHero {...props} />)
  return props
}

beforeEach(() => {
  // Plain fake timers here — the clock stays frozen at exactly 14:30 for the 8 tests below
  // that assert on time-derived strings (the live clock, the 5h 38m elapsed text). The two
  // tests that drive userEvent opt into `shouldAdvanceTime: true` locally (see below) instead
  // of it applying file-wide, so those 8 never risk a minute-boundary flake under CI contention.
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 7, 21, 14, 30, 0))
})
afterEach(() => {
  vi.useRealTimers()
})

describe("ScheduleHero", () => {
  it("headlines today's shift with its time range", () => {
    renderHero()
    expect(screen.getByRole("heading", { name: /Day Shift · 09:00–18:00/ })).toBeInTheDocument()
  })

  it("headlines a day off when there is no shift", () => {
    renderHero({ today: day({ shift: null }) })
    expect(screen.getByRole("heading", { name: /No shift scheduled/ })).toBeInTheDocument()
  })

  it("headlines leave over an empty day", () => {
    renderHero({ today: day({ shift: null, leaveTypeCode: "AL" }) })
    expect(screen.getByRole("heading", { name: /On leave · AL/ })).toBeInTheDocument()
  })

  it("shows the holiday name", () => {
    renderHero({ today: day({ holidayName: "Maulidur Rasul" }) })
    expect(screen.getByText(/Maulidur Rasul/)).toBeInTheDocument()
  })

  it("renders the live clock", () => {
    renderHero()
    expect(screen.getByTestId("hero-clock")).toHaveTextContent("14:30")
  })

  it("offers Clock in when off", async () => {
    // `shouldAdvanceTime` scoped to this test only — required for happy-dom + user-event's
    // internal pointer-event wait() to resolve at all (plain fake timers hang it). See
    // EmailTemplatesTab.test.tsx for the same repo-established pattern. Re-installing fake
    // timers requires a full reset first — switching modes on an already-fake clock silently
    // fails to enable the real-time-follow ticker (verified empirically) — so we drop back to
    // real timers, then re-fake with shouldAdvanceTime, then re-pin the system time.
    vi.useRealTimers()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 21, 14, 30, 0))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const props = renderHero()
    await user.click(screen.getByRole("button", { name: /clock in/i }))
    expect(props.onClockIn).toHaveBeenCalled()
  })

  it("offers Clock out and shows elapsed time when clocked in", async () => {
    // Scoped for the same reason as above. This test also asserts a time-derived string
    // (5h 38m), but only immediately after render, before any real time has had a chance
    // to elapse — safe under `shouldAdvanceTime`.
    vi.useRealTimers()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 21, 14, 30, 0))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const props = renderHero({
      clockState: { status: "in", since: new Date(2026, 7, 21, 8, 52, 0).toISOString() },
    })
    expect(screen.getByText(/5h 38m/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /clock out/i }))
    expect(props.onClockOut).toHaveBeenCalled()
  })

  it("shows both times when already clocked out", () => {
    renderHero({ clockState: { status: "out", clockedIn: "08:52", clockedOut: "18:03" } })
    expect(screen.getByText(/08:52/)).toBeInTheDocument()
    expect(screen.getByText(/18:03/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /clock (in|out)/i })).toBeNull()
  })

  it("hides the clock button without the permission", () => {
    renderHero({ canClock: false })
    expect(screen.queryByRole("button", { name: /clock in/i })).toBeNull()
    expect(screen.getByRole("heading", { name: /Day Shift/ })).toBeInTheDocument()
  })

  it("disables the button while busy", () => {
    renderHero({ busy: true })
    expect(screen.getByRole("button", { name: /clock in/i })).toBeDisabled()
  })
})
