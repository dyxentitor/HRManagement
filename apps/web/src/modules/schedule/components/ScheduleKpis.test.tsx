import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { DayModel } from "../lib/day-model"
import { ScheduleKpis } from "./ScheduleKpis"

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

const ANCHOR = "2026-08-24"

describe("ScheduleKpis", () => {
  it("counts shifts, hours and days off across the range", () => {
    render(
      <ScheduleKpis
        view="week"
        anchor={ANCHOR}
        days={[
          day("2026-08-24", { shift: SHIFT }),
          day("2026-08-25", { shift: { ...SHIFT, hours: 8 } }),
          day("2026-08-26"),
        ]}
        pendingSwaps={0}
      />,
    )
    expect(screen.getByTestId("kpi-shifts")).toHaveTextContent("2")
    expect(screen.getByTestId("kpi-hours")).toHaveTextContent("17h")
    expect(screen.getByTestId("kpi-daysoff")).toHaveTextContent("1")
  })

  it("does not count a leave day as a day off", () => {
    render(
      <ScheduleKpis
        view="week"
        anchor={ANCHOR}
        days={[day("2026-08-26"), day("2026-08-27", { leaveTypeCode: "AL" })]}
        pendingSwaps={0}
      />,
    )
    expect(screen.getByTestId("kpi-daysoff")).toHaveTextContent("1")
  })

  it("only counts days inside the anchor month in month view", () => {
    render(
      <ScheduleKpis
        view="month"
        anchor={ANCHOR}
        days={[
          day("2026-07-31", { inAnchorMonth: false, shift: SHIFT }),
          day("2026-08-01", { shift: SHIFT }),
        ]}
        pendingSwaps={0}
      />,
    )
    expect(screen.getByTestId("kpi-shifts")).toHaveTextContent("1")
  })

  it("labels tiles for the active view", () => {
    const { rerender } = render(
      <ScheduleKpis view="week" anchor={ANCHOR} days={[]} pendingSwaps={0} />,
    )
    expect(screen.getByText("Shifts this week")).toBeInTheDocument()
    rerender(<ScheduleKpis view="month" anchor={ANCHOR} days={[]} pendingSwaps={0} />)
    expect(screen.getByText("Shifts this month")).toBeInTheDocument()
  })

  it("renders exactly four tiles, with no duplicate of the holidays panel", () => {
    render(<ScheduleKpis view="month" anchor={ANCHOR} days={[]} pendingSwaps={0} />)

    for (const id of ["kpi-shifts", "kpi-hours", "kpi-daysoff", "kpi-swaps"]) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
    expect(screen.queryByTestId("kpi-holiday")).toBeNull()
    expect(screen.queryByText(/next holiday/i)).toBeNull()
  })

  it("anchors the supporting text to the visible range, not to today", () => {
    render(<ScheduleKpis view="month" anchor="2026-08-24" days={[]} pendingSwaps={0} />)
    // Three range-scoped tiles share the range caption.
    expect(screen.getAllByText("August 2026")).toHaveLength(3)
  })

  it("tells the employee when no request needs attention", () => {
    const { rerender } = render(
      <ScheduleKpis view="week" anchor={ANCHOR} days={[]} pendingSwaps={0} />,
    )
    expect(screen.getByTestId("kpi-swaps")).toHaveTextContent("No action required")

    rerender(<ScheduleKpis view="week" anchor={ANCHOR} days={[]} pendingSwaps={3} />)
    expect(screen.getByTestId("kpi-swaps")).toHaveTextContent("3")
    expect(screen.getByTestId("kpi-swaps")).toHaveTextContent("Awaiting a decision")
  })
})
