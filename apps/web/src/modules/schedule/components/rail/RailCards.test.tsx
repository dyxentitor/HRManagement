import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ perms: new Set<string>() }))
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ perms: mocks.perms }) }))

import type { DayModel } from "../../lib/day-model"
import { QuickActionsCard } from "./QuickActionsCard"
import { UpcomingHolidaysCard } from "./UpcomingHolidaysCard"
import { UpcomingShiftsCard } from "./UpcomingShiftsCard"

function day(date: string, withShift: boolean): DayModel {
  return {
    date,
    isToday: false,
    isWeekend: false,
    inAnchorMonth: true,
    holidayName: null,
    leaveTypeCode: null,
    hasPendingSwap: false,
    shift: withShift
      ? {
          assignmentId: `a-${date}`,
          name: "Day Shift",
          code: "D",
          tone: "sky",
          timeRange: "09:00–18:00",
          hours: 9,
          crossesMidnight: false,
          endsOn: null,
          coveringForName: null,
        }
      : null,
    swapEligibility: { canSwap: withShift, reason: null },
  }
}

describe("UpcomingShiftsCard", () => {
  it("lists at most five shift days and skips empty ones", () => {
    mocks.perms = new Set(["schedule:swap:request:self"])
    const days = [
      day("2026-08-22", true),
      day("2026-08-23", false),
      day("2026-08-24", true),
      day("2026-08-25", true),
      day("2026-08-26", true),
      day("2026-08-27", true),
      day("2026-08-28", true),
    ]
    render(
      <MemoryRouter>
        <UpcomingShiftsCard days={days} onRequestSwap={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getAllByTestId("upcoming-shift-row")).toHaveLength(5)
  })

  it("renders an empty message when nothing is upcoming", () => {
    render(
      <MemoryRouter>
        <UpcomingShiftsCard days={[day("2026-08-22", false)]} onRequestSwap={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/No upcoming shifts/i)).toBeInTheDocument()
  })
})

describe("UpcomingHolidaysCard", () => {
  it("lists the next four holidays from today onward", () => {
    render(
      <UpcomingHolidaysCard
        todayIso="2026-08-21"
        holidays={[
          { date: "2026-01-01", name: "New Year" },
          { date: "2026-08-26", name: "Maulidur Rasul" },
          { date: "2026-08-31", name: "National Day" },
          { date: "2026-09-16", name: "Malaysia Day" },
          { date: "2026-11-08", name: "Deepavali" },
          { date: "2026-12-25", name: "Christmas Day" },
        ]}
      />,
    )
    const rows = screen.getAllByTestId("upcoming-holiday-row")
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent("Maulidur Rasul")
    expect(screen.queryByText("New Year")).toBeNull()
  })

  it("renders an empty message when none remain", () => {
    render(<UpcomingHolidaysCard todayIso="2026-12-31" holidays={[]} />)
    expect(screen.getByText(/No upcoming public holidays/i)).toBeInTheDocument()
  })

  it("keeps a long holiday name inside a shrinkable, truncating wrapper", () => {
    const longName = "Yang di-Pertuan Agong's Birthday"
    render(
      <UpcomingHolidaysCard
        todayIso="2026-08-21"
        holidays={[{ date: "2026-08-26", name: longName }]}
      />,
    )
    const nameEl = screen.getByText(longName)
    expect(nameEl).toBeInTheDocument()
    expect(nameEl).toHaveClass("truncate")
    // The truncating span's parent must be able to shrink below its content's
    // natural width for the ellipsis to ever engage in a flex row.
    expect(nameEl.parentElement).toHaveClass("min-w-0", "flex-1")
  })
})

describe("QuickActionsCard", () => {
  it("shows only actions the viewer holds permissions for", () => {
    mocks.perms = new Set(["leave:request:create:self"])
    render(
      <MemoryRouter>
        <QuickActionsCard nextSwappableAssignmentId="a1" onRequestSwap={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole("link", { name: /apply for leave/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /request a shift swap/i })).toBeNull()
  })

  it("requests a swap for the next eligible shift", async () => {
    mocks.perms = new Set(["schedule:swap:request:self"])
    const user = userEvent.setup()
    const onRequestSwap = vi.fn()
    render(
      <MemoryRouter>
        <QuickActionsCard nextSwappableAssignmentId="a1" onRequestSwap={onRequestSwap} />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole("button", { name: /request a shift swap/i }))
    expect(onRequestSwap).toHaveBeenCalledWith("a1")
  })

  it("disables the swap action when no shift is eligible", () => {
    mocks.perms = new Set(["schedule:swap:request:self"])
    render(
      <MemoryRouter>
        <QuickActionsCard nextSwappableAssignmentId={null} onRequestSwap={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole("button", { name: /request a shift swap/i })).toBeDisabled()
  })

  it("conveys the disabled reason via aria-label, not title alone", () => {
    // `title` is surfaced inconsistently by screen readers — the reason must
    // also be reachable through the accessible name.
    mocks.perms = new Set(["schedule:swap:request:self"])
    render(
      <MemoryRouter>
        <QuickActionsCard nextSwappableAssignmentId={null} onRequestSwap={vi.fn()} />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole("button", { name: /no upcoming shift is eligible for a swap/i }),
    ).toBeInTheDocument()
  })
})
