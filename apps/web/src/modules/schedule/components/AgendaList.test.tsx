import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ perms: new Set(["schedule:swap:request:self"]) }),
}))

import type { DayModel } from "../lib/day-model"
import { AgendaList } from "./AgendaList"

function day(date: string, over: Partial<DayModel> = {}): DayModel {
  return {
    date,
    isToday: false,
    isWeekend: false,
    inAnchorMonth: true,
    holidayName: null,
    leaveTypeCode: null,
    hasPendingSwap: false,
    shift: null,
    swapEligibility: { canSwap: false, reason: null },
    ...over,
  }
}

const SHIFT = {
  assignmentId: "a1",
  name: "Day Shift",
  code: "D",
  tone: "sky" as const,
  timeRange: "09:00–18:00",
  hours: 9,
  crossesMidnight: false,
  endsOn: null,
  coveringForName: null,
}

function renderList(days: DayModel[]) {
  render(
    <MemoryRouter>
      <AgendaList days={days} onRequestSwap={vi.fn()} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  // A Friday.
  vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0))
})
afterEach(() => {
  vi.useRealTimers()
})

describe("AgendaList", () => {
  it("groups rows by week with relative headings", () => {
    renderList([
      day("2026-08-21", { isToday: true, shift: SHIFT }),
      day("2026-08-25", { shift: SHIFT }),
      day("2026-09-08", { shift: SHIFT }),
    ])
    const headings = screen.getAllByTestId("agenda-week-heading").map((h) => h.textContent)
    expect(headings[0]).toBe("This week")
    expect(headings[1]).toBe("Next week")
    expect(headings[2]).toMatch(/^Week of 7 Sep/)
  })

  it("renders a row per day including empty ones", () => {
    renderList([day("2026-08-21", { shift: SHIFT }), day("2026-08-22")])
    expect(screen.getAllByTestId("agenda-row")).toHaveLength(2)
    expect(screen.getByText("Off")).toBeInTheDocument()
  })

  it("shows shift name and time range", () => {
    renderList([day("2026-08-21", { shift: SHIFT })])
    expect(screen.getByText("Day Shift")).toBeInTheDocument()
    expect(screen.getByText(/09:00–18:00/)).toBeInTheDocument()
  })

  it("shows an overnight shift's end day", () => {
    renderList([
      day("2026-08-22", { shift: { ...SHIFT, crossesMidnight: true, endsOn: "2026-08-23" } }),
    ])
    expect(screen.getByText(/ends Sun 23/)).toBeInTheDocument()
  })

  it("shows leave", () => {
    renderList([day("2026-08-29", { leaveTypeCode: "AL" })])
    expect(screen.getByText(/On leave · AL/)).toBeInTheDocument()
  })

  it("shows a holiday", () => {
    renderList([day("2026-08-26", { holidayName: "Maulidur Rasul", shift: SHIFT })])
    expect(screen.getByText("Maulidur Rasul")).toBeInTheDocument()
  })

  it("marks today's row", () => {
    renderList([day("2026-08-21", { isToday: true, shift: SHIFT })])
    expect(screen.getByTestId("agenda-row")).toHaveAttribute("data-today", "true")
  })

  it("renders an empty state when there is nothing in range", () => {
    renderList([])
    expect(screen.getByText(/No shifts published for this period yet/i)).toBeInTheDocument()
  })

  // Overlay combinations not covered above — states are additive, not
  // exclusive. MonthGrid (Task 4) silently dropped the holiday name on a
  // leave + holiday day with no shift; WeekStrip (Task 5) rendered a
  // contradictory "Off" next to a holiday-only day. These pin the fixed
  // behaviour so a regression fails loudly.

  it("shows shift and leave together", () => {
    renderList([day("2026-08-21", { shift: SHIFT, leaveTypeCode: "AL" })])
    expect(screen.getByText("Day Shift")).toBeInTheDocument()
    expect(screen.getByText(/On leave · AL/)).toBeInTheDocument()
  })

  it("shows shift, holiday and leave all together", () => {
    renderList([
      day("2026-08-21", { shift: SHIFT, holidayName: "Merdeka Day", leaveTypeCode: "AL" }),
    ])
    expect(screen.getByText("Day Shift")).toBeInTheDocument()
    expect(screen.getByText("Merdeka Day")).toBeInTheDocument()
    expect(screen.getByText(/On leave · AL/)).toBeInTheDocument()
  })

  it("shows leave and holiday together when there is no shift", () => {
    renderList([day("2026-08-21", { holidayName: "Deepavali", leaveTypeCode: "AL" })])
    expect(screen.getByText("Deepavali")).toBeInTheDocument()
    expect(screen.getByText(/On leave · AL/)).toBeInTheDocument()
    expect(screen.queryByText("Off")).not.toBeInTheDocument()
  })

  it("shows a holiday-only day without a contradictory Off", () => {
    renderList([day("2026-08-21", { holidayName: "Merdeka Day" })])
    expect(screen.getByText("Merdeka Day")).toBeInTheDocument()
    expect(screen.queryByText("Off")).not.toBeInTheDocument()
  })

  it("dims a genuinely empty day and shows Off", () => {
    renderList([day("2026-08-21")])
    const row = screen.getByTestId("agenda-row")
    expect(screen.getByText("Off")).toBeInTheDocument()
    expect(row.className).toMatch(/opacity-60/)
  })
})
