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

describe("ScheduleKpis", () => {
  it("counts shifts, hours and days off across the range", () => {
    render(
      <ScheduleKpis
        view="week"
        days={[
          day("2026-08-24", { shift: SHIFT }),
          day("2026-08-25", { shift: { ...SHIFT, hours: 8 } }),
          day("2026-08-26"),
        ]}
        nextHoliday={null}
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
        days={[day("2026-08-26"), day("2026-08-27", { leaveTypeCode: "AL" })]}
        nextHoliday={null}
        pendingSwaps={0}
      />,
    )
    expect(screen.getByTestId("kpi-daysoff")).toHaveTextContent("1")
  })

  it("only counts days inside the anchor month in month view", () => {
    render(
      <ScheduleKpis
        view="month"
        days={[
          day("2026-07-31", { inAnchorMonth: false, shift: SHIFT }),
          day("2026-08-01", { shift: SHIFT }),
        ]}
        nextHoliday={null}
        pendingSwaps={0}
      />,
    )
    expect(screen.getByTestId("kpi-shifts")).toHaveTextContent("1")
  })

  it("labels tiles for the active view", () => {
    const { rerender } = render(
      <ScheduleKpis view="week" days={[]} nextHoliday={null} pendingSwaps={0} />,
    )
    expect(screen.getByText("Shifts this week")).toBeInTheDocument()
    rerender(<ScheduleKpis view="month" days={[]} nextHoliday={null} pendingSwaps={0} />)
    expect(screen.getByText("Shifts this month")).toBeInTheDocument()
  })

  it("shows the next holiday", () => {
    render(
      <ScheduleKpis
        view="week"
        days={[]}
        nextHoliday={{ date: "2026-08-26", name: "Maulidur Rasul" }}
        pendingSwaps={0}
      />,
    )
    expect(screen.getByTestId("kpi-holiday")).toHaveTextContent("26 Aug")
  })

  it("falls back to an em dash with no upcoming holiday", () => {
    render(<ScheduleKpis view="week" days={[]} nextHoliday={null} pendingSwaps={0} />)
    expect(screen.getByTestId("kpi-holiday")).toHaveTextContent("—")
  })

  it("shows the pending swap count", () => {
    render(<ScheduleKpis view="week" days={[]} nextHoliday={null} pendingSwaps={3} />)
    expect(screen.getByTestId("kpi-swaps")).toHaveTextContent("3")
  })
})
