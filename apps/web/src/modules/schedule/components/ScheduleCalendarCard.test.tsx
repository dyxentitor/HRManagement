import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ perms: new Set(["schedule:swap:request:self"]) }),
}))

import type { DayModel } from "../lib/day-model"
import type { ScheduleView } from "../lib/schedule-range"
import { ScheduleCalendarCard } from "./ScheduleCalendarCard"

const DAYS: DayModel[] = [
  {
    date: "2026-08-25",
    isToday: false,
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
    swapEligibility: { canSwap: true, reason: null },
  },
]

function renderCard(over: Partial<Parameters<typeof ScheduleCalendarCard>[0]> = {}) {
  const props = {
    view: "month" as ScheduleView,
    anchor: "2026-08-15",
    days: DAYS,
    loading: false,
    onViewChange: vi.fn(),
    onStep: vi.fn(),
    onToday: vi.fn(),
    onRequestSwap: vi.fn(),
    ...over,
  }
  render(
    <MemoryRouter>
      <ScheduleCalendarCard {...props} />
    </MemoryRouter>,
  )
  return props
}

describe("ScheduleCalendarCard", () => {
  it("shows the range label for the active view", () => {
    renderCard()
    expect(screen.getByText("August 2026")).toBeInTheDocument()
  })

  it("shows the week label in week view", () => {
    renderCard({ view: "week", anchor: "2026-08-25" })
    expect(screen.getByText("24 – 30 August 2026")).toBeInTheDocument()
  })

  it("renders the month grid in month view", () => {
    renderCard({ view: "month" })
    expect(screen.getAllByTestId("month-cell")).toHaveLength(1)
  })

  it("renders the week strip in week view", () => {
    renderCard({ view: "week" })
    expect(screen.getAllByTestId("week-cell")).toHaveLength(1)
  })

  it("renders the agenda list in agenda view", () => {
    renderCard({ view: "agenda" })
    expect(screen.getAllByTestId("agenda-row")).toHaveLength(1)
  })

  it("steps backward and forward", async () => {
    const user = userEvent.setup()
    const props = renderCard()
    await user.click(screen.getByRole("button", { name: /previous/i }))
    expect(props.onStep).toHaveBeenCalledWith(-1)
    await user.click(screen.getByRole("button", { name: /next/i }))
    expect(props.onStep).toHaveBeenCalledWith(1)
  })

  it("jumps to today", async () => {
    const user = userEvent.setup()
    const props = renderCard()
    await user.click(screen.getByRole("button", { name: /^today$/i }))
    expect(props.onToday).toHaveBeenCalled()
  })

  it("switches views", async () => {
    const user = userEvent.setup()
    const props = renderCard()
    await user.click(screen.getByRole("tab", { name: /week/i }))
    expect(props.onViewChange).toHaveBeenCalledWith("week")
  })

  it("shows a skeleton while loading instead of the grid", () => {
    renderCard({ loading: true })
    expect(screen.getByTestId("calendar-skeleton")).toBeInTheDocument()
    expect(screen.queryByTestId("month-cell")).toBeNull()
  })
})
