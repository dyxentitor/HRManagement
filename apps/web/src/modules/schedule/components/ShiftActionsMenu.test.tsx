import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ perms: new Set<string>() }))
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ perms: mocks.perms }) }))

import type { DayModel } from "../lib/day-model"
import { ShiftActionsMenu } from "./ShiftActionsMenu"

function day(over: Partial<DayModel> = {}): DayModel {
  return {
    date: "2026-08-26",
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
    ...over,
  }
}

function renderMenu(d: DayModel, onRequestSwap = vi.fn()) {
  render(
    <MemoryRouter>
      <ShiftActionsMenu day={d} onRequestSwap={onRequestSwap} />
    </MemoryRouter>,
  )
  return onRequestSwap
}

beforeEach(() => {
  mocks.perms = new Set(["schedule:swap:request:self", "leave:request:create:self"])
})

describe("ShiftActionsMenu", () => {
  it("renders nothing when the day has no shift", () => {
    const { container } = render(
      <MemoryRouter>
        <ShiftActionsMenu day={day({ shift: null })} onRequestSwap={vi.fn()} />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("calls onRequestSwap with the assignment id for an eligible shift", async () => {
    const user = userEvent.setup()
    const onRequestSwap = renderMenu(day())
    await user.click(screen.getByRole("button", { name: /actions for/i }))
    await user.click(screen.getByRole("menuitem", { name: /request a shift swap/i }))
    expect(onRequestSwap).toHaveBeenCalledWith("a1")
  })

  it("disables swap and states the reason instead of hiding it", async () => {
    const user = userEvent.setup()
    renderMenu(
      day({
        swapEligibility: { canSwap: false, reason: "Only future shifts can be swapped" },
      }),
    )
    await user.click(screen.getByRole("button", { name: /actions for/i }))
    const item = screen.getByRole("menuitem", { name: /request a shift swap/i })
    expect(item).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("Only future shifts can be swapped")).toBeInTheDocument()
  })

  it("omits the swap item entirely without the permission", async () => {
    mocks.perms = new Set(["leave:request:create:self"])
    const user = userEvent.setup()
    renderMenu(day())
    await user.click(screen.getByRole("button", { name: /actions for/i }))
    expect(screen.queryByRole("menuitem", { name: /request a shift swap/i })).toBeNull()
  })

  it("deep-links leave to the day's date", async () => {
    const user = userEvent.setup()
    renderMenu(day())
    await user.click(screen.getByRole("button", { name: /actions for/i }))
    expect(screen.getByRole("menuitem", { name: /apply for leave this day/i })).toHaveAttribute(
      "href",
      "/leave/apply?start=2026-08-26",
    )
  })

  it("omits the leave item without the permission", async () => {
    mocks.perms = new Set(["schedule:swap:request:self"])
    const user = userEvent.setup()
    renderMenu(day())
    await user.click(screen.getByRole("button", { name: /actions for/i }))
    expect(screen.queryByRole("menuitem", { name: /apply for leave this day/i })).toBeNull()
  })

  it("labels the trigger with the date and shift for screen readers", () => {
    renderMenu(day())
    expect(
      screen.getByRole("button", { name: "Actions for 26 Aug 2026, Day Shift" }),
    ).toBeInTheDocument()
  })
})
