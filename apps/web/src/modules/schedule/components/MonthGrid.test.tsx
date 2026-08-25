import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ perms: new Set(["schedule:swap:request:self"]) }),
}))

import type { DayModel } from "../lib/day-model"
import { MonthGrid } from "./MonthGrid"

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

function renderGrid(days: DayModel[]) {
  render(
    <MemoryRouter>
      <MonthGrid days={days} onRequestSwap={vi.fn()} />
    </MemoryRouter>,
  )
}

describe("MonthGrid", () => {
  it("renders Monday-first weekday headers", () => {
    renderGrid([day("2026-08-03")])
    const headers = screen.getAllByTestId("weekday-header").map((h) => h.textContent)
    expect(headers).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
  })

  it("renders one cell per day", () => {
    renderGrid([day("2026-08-03"), day("2026-08-04"), day("2026-08-05")])
    expect(screen.getAllByTestId("month-cell")).toHaveLength(3)
  })

  it("spells the shift type out instead of showing a bare letter", () => {
    renderGrid([day("2026-08-03", { shift: SHIFT })])
    const cell = screen.getByTestId("month-cell")
    // "DAY", not "D" — a single letter is unreadable without the legend.
    expect(within(cell).getByText("DAY")).toBeInTheDocument()
    expect(within(cell).getByText(/09:00–18:00/)).toBeInTheDocument()
  })

  it("labels a night shift as NIGHT", () => {
    renderGrid([day("2026-08-03", { shift: { ...SHIFT, code: "N", name: "Night Shift" } })])
    expect(within(screen.getByTestId("month-cell")).getByText("NIGHT")).toBeInTheDocument()
  })

  it("exposes the full detail for anything the narrow cell truncates", () => {
    renderGrid([
      day("2026-08-03", {
        shift: { ...SHIFT, coveringForName: "Nurul" },
        holidayName: "Maulidur Rasul",
      }),
    ])
    const detail = within(screen.getByTestId("month-cell")).getByTitle(/Day Shift/)
    expect(detail.getAttribute("title")).toContain("09:00–18:00")
    expect(detail.getAttribute("title")).toContain("covering Nurul")
    expect(detail.getAttribute("title")).toContain("Maulidur Rasul")
  })

  it("defines the symbols it uses in a legend", () => {
    renderGrid([day("2026-08-03", { shift: SHIFT })])
    const legend = screen.getByTestId("month-legend")
    expect(within(legend).getByText(/DAY \/ NIGHT \/ EVE/)).toBeInTheDocument()
    expect(within(legend).getByText(/Crosses midnight/)).toBeInTheDocument()
  })

  it("marks an overnight shift", () => {
    renderGrid([
      day("2026-08-03", {
        shift: { ...SHIFT, crossesMidnight: true, endsOn: "2026-08-04" },
      }),
    ])
    expect(screen.getByTitle("Crosses midnight")).toBeInTheDocument()
  })

  it("shows On leave when there is leave and no shift", () => {
    renderGrid([day("2026-08-03", { leaveTypeCode: "AL" })])
    expect(screen.getByText(/On leave/)).toBeInTheDocument()
    expect(screen.getByText(/AL/)).toBeInTheDocument()
  })

  it("shows BOTH the shift and a leave tag when they collide", () => {
    renderGrid([day("2026-08-03", { shift: SHIFT, leaveTypeCode: "AL" })])
    const cell = screen.getByTestId("month-cell")
    expect(within(cell).getByText(/09:00–18:00/)).toBeInTheDocument()
    expect(within(cell).getByText("AL")).toBeInTheDocument()
  })

  it("shows the holiday name", () => {
    renderGrid([day("2026-08-26", { holidayName: "Maulidur Rasul" })])
    expect(screen.getByText("Maulidur Rasul")).toBeInTheDocument()
  })

  it("shows BOTH the leave tag and the holiday name when leave falls on a holiday, no shift", () => {
    renderGrid([day("2026-08-26", { holidayName: "Maulidur Rasul", leaveTypeCode: "AL" })])
    expect(screen.getByText(/On leave/)).toBeInTheDocument()
    expect(screen.getByText("Maulidur Rasul")).toBeInTheDocument()
  })

  it("shows BOTH the shift and the holiday name when a shift is worked on a holiday", () => {
    renderGrid([day("2026-08-26", { shift: SHIFT, holidayName: "Maulidur Rasul" })])
    const cell = screen.getByTestId("month-cell")
    expect(within(cell).getByText(/09:00–18:00/)).toBeInTheDocument()
    expect(within(cell).getByText("Maulidur Rasul")).toBeInTheDocument()
  })

  it("shows the shift, the leave tag, AND the holiday name when all three collide", () => {
    renderGrid([
      day("2026-08-26", { shift: SHIFT, leaveTypeCode: "AL", holidayName: "Maulidur Rasul" }),
    ])
    const cell = screen.getByTestId("month-cell")
    expect(within(cell).getByText(/09:00–18:00/)).toBeInTheDocument()
    expect(within(cell).getByText("AL")).toBeInTheDocument()
    expect(within(cell).getByText("Maulidur Rasul")).toBeInTheDocument()
  })

  it("shows Off for an empty working day", () => {
    renderGrid([day("2026-08-03")])
    expect(screen.getByText("Off")).toBeInTheDocument()
  })

  it("marks today", () => {
    renderGrid([day("2026-08-03", { isToday: true })])
    expect(screen.getByTestId("month-cell")).toHaveAttribute("data-today", "true")
  })

  it("dims days outside the anchor month", () => {
    renderGrid([day("2026-07-31", { inAnchorMonth: false })])
    expect(screen.getByTestId("month-cell")).toHaveAttribute("data-outside", "true")
  })

  it("marks a pending swap", () => {
    renderGrid([day("2026-08-03", { shift: SHIFT, hasPendingSwap: true })])
    expect(screen.getByTitle("Swap pending")).toBeInTheDocument()
  })

  it("renders an actions menu only where there is a shift", () => {
    renderGrid([day("2026-08-03", { shift: SHIFT }), day("2026-08-04")])
    expect(screen.getAllByRole("button", { name: /actions for/i })).toHaveLength(1)
  })
})
