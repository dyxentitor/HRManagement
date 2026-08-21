import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ perms: new Set(["schedule:swap:request:self"]) }),
}))

import type { DayModel } from "../lib/day-model"
import { WeekStrip } from "./WeekStrip"

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

function renderStrip(days: DayModel[]) {
  render(
    <MemoryRouter>
      <WeekStrip days={days} onRequestSwap={vi.fn()} />
    </MemoryRouter>,
  )
}

describe("WeekStrip", () => {
  it("renders one cell per day with weekday and date number", () => {
    renderStrip([day("2026-08-24"), day("2026-08-25")])
    const cells = screen.getAllByTestId("week-cell")
    expect(cells).toHaveLength(2)
    expect(within(cells[0]).getByText("Mon")).toBeInTheDocument()
    expect(within(cells[0]).getByText("24")).toBeInTheDocument()
  })

  it("shows the full shift name, time range and hours", () => {
    renderStrip([day("2026-08-25", { shift: SHIFT })])
    const cell = screen.getByTestId("week-cell")
    expect(within(cell).getByText("Day Shift")).toBeInTheDocument()
    expect(within(cell).getByText("09:00–18:00")).toBeInTheDocument()
    expect(within(cell).getByText("9h")).toBeInTheDocument()
  })

  it("tags an overnight shift with the day it ends on", () => {
    renderStrip([
      day("2026-08-27", {
        shift: { ...SHIFT, crossesMidnight: true, endsOn: "2026-08-28" },
      }),
    ])
    expect(screen.getByText("Overnight")).toBeInTheDocument()
    expect(screen.getByText(/ends Fri 28/)).toBeInTheDocument()
  })

  it("tags a cover-up with the person covered", () => {
    renderStrip([day("2026-08-28", { shift: { ...SHIFT, coveringForName: "Aisyah Karim" } })])
    expect(screen.getByText("Cover")).toBeInTheDocument()
    expect(screen.getByText(/Covering Aisyah Karim/)).toBeInTheDocument()
  })

  it("tags a holiday", () => {
    renderStrip([day("2026-08-26", { shift: SHIFT, holidayName: "Maulidur Rasul" })])
    expect(screen.getByText("Holiday")).toBeInTheDocument()
    expect(screen.getByText("Maulidur Rasul")).toBeInTheDocument()
  })

  it("tags leave", () => {
    renderStrip([day("2026-08-29", { leaveTypeCode: "AL" })])
    expect(screen.getByText("Leave")).toBeInTheDocument()
  })

  it("tags a pending swap", () => {
    renderStrip([day("2026-08-26", { shift: SHIFT, hasPendingSwap: true })])
    expect(screen.getByText("Swap pending")).toBeInTheDocument()
  })

  it("shows Off for an empty day", () => {
    renderStrip([day("2026-08-30")])
    expect(screen.getByText("Off")).toBeInTheDocument()
  })

  it("marks today", () => {
    renderStrip([day("2026-08-25", { isToday: true })])
    expect(screen.getByTestId("week-cell")).toHaveAttribute("data-today", "true")
    expect(screen.getByText("Today")).toBeInTheDocument()
  })

  it("renders a legend", () => {
    renderStrip([day("2026-08-25")])
    expect(screen.getByTestId("week-legend")).toBeInTheDocument()
  })

  it("documents the Swap pending pill in the legend", () => {
    renderStrip([day("2026-08-25")])
    expect(within(screen.getByTestId("week-legend")).getByText(/Swap pending/)).toBeInTheDocument()
  })

  // Overlay combinations the brief's list above doesn't cover — see
  // CLAUDE.md-style overlay rule: states are additive, never exclusive.
  // MonthGrid (Task 4) shipped a ternary chain that silently dropped the
  // holiday name on leave+holiday-no-shift; these guard WeekStrip against
  // the same regression.

  it("shows BOTH the shift and a leave tag when they collide", () => {
    renderStrip([day("2026-08-25", { shift: SHIFT, leaveTypeCode: "AL" })])
    const cell = screen.getByTestId("week-cell")
    expect(within(cell).getByText("Day Shift")).toBeInTheDocument()
    expect(within(cell).getByText("Leave")).toBeInTheDocument()
  })

  it("shows BOTH the shift and the holiday name when a shift is worked on a holiday", () => {
    renderStrip([day("2026-08-26", { shift: SHIFT, holidayName: "Maulidur Rasul" })])
    const cell = screen.getByTestId("week-cell")
    expect(within(cell).getByText("Day Shift")).toBeInTheDocument()
    expect(within(cell).getByText("Maulidur Rasul")).toBeInTheDocument()
  })

  it("shows BOTH the leave state and the holiday name when leave falls on a holiday, no shift", () => {
    renderStrip([day("2026-08-26", { holidayName: "Maulidur Rasul", leaveTypeCode: "AL" })])
    const cell = screen.getByTestId("week-cell")
    expect(within(cell).getByText(/On leave/)).toBeInTheDocument()
    expect(within(cell).getByText("AL", { exact: false })).toBeInTheDocument()
    expect(within(cell).getByText("Maulidur Rasul")).toBeInTheDocument()
  })

  it("shows the holiday name and not Off when the only thing on the day is a holiday", () => {
    renderStrip([day("2026-08-26", { holidayName: "Maulidur Rasul" })])
    const cell = screen.getByTestId("week-cell")
    expect(within(cell).getByText("Maulidur Rasul")).toBeInTheDocument()
    expect(within(cell).queryByText("Off")).not.toBeInTheDocument()
  })

  it("shows the shift, the leave tag, AND the holiday name when all three collide", () => {
    renderStrip([
      day("2026-08-26", { shift: SHIFT, leaveTypeCode: "AL", holidayName: "Maulidur Rasul" }),
    ])
    const cell = screen.getByTestId("week-cell")
    expect(within(cell).getByText("Day Shift")).toBeInTheDocument()
    expect(within(cell).getByText("Leave")).toBeInTheDocument()
    expect(within(cell).getByText("Maulidur Rasul")).toBeInTheDocument()
  })
})
