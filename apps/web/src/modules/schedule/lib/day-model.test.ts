import { describe, expect, it } from "vitest"

import { buildDayModels } from "./day-model"

const SHIFTS = [
  {
    id: "sh-day",
    code: "D",
    name: "Day Shift",
    start_time: "09:00:00",
    end_time: "18:00:00",
    crosses_midnight: false,
    color: "#8ECAE6",
  },
  {
    id: "sh-night",
    code: "N",
    name: "Night Shift",
    start_time: "18:00:00",
    end_time: "02:00:00",
    crosses_midnight: true,
    color: "#C8B6FF",
  },
]

function assignment(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    employee: "e1",
    employee_code: "E001",
    shift: "sh-day",
    shift_name: "Day Shift",
    shift_code: "D",
    covering_for: null,
    covering_for_name: null,
    work_date: "2026-08-25",
    status: "scheduled",
    published_at: "2026-08-01T00:00:00Z",
    is_published: true,
    notes: "",
    ...over,
  }
}

function build(over: Record<string, unknown> = {}) {
  return buildDayModels({
    dates: ["2026-08-24", "2026-08-25", "2026-08-26"],
    anchorMonth: "2026-08",
    todayIso: "2026-08-21",
    assignments: [assignment()],
    shifts: SHIFTS,
    holidays: [],
    leaves: [],
    swaps: [],
    ...over,
  } as Parameters<typeof buildDayModels>[0])
}

describe("buildDayModels", () => {
  it("returns one model per requested date, in order", () => {
    const days = build()
    expect(days.map((d) => d.date)).toEqual(["2026-08-24", "2026-08-25", "2026-08-26"])
  })

  it("resolves shift name, time range, tone and hours", () => {
    const day = build().find((d) => d.date === "2026-08-25")
    expect(day?.shift).toMatchObject({
      assignmentId: "a1",
      name: "Day Shift",
      code: "D",
      tone: "sky",
      timeRange: "09:00–18:00",
      hours: 9,
      crossesMidnight: false,
      endsOn: null,
    })
  })

  it("flags an overnight shift with the day it ends on", () => {
    const days = build({
      assignments: [assignment({ shift: "sh-night", shift_name: "Night Shift", shift_code: "N" })],
    })
    const day = days.find((d) => d.date === "2026-08-25")
    expect(day?.shift?.crossesMidnight).toBe(true)
    expect(day?.shift?.endsOn).toBe("2026-08-26")
    expect(day?.shift?.hours).toBe(8)
  })

  it("keeps the shift but degrades time and hours when the catalogue failed to load", () => {
    const day = build({ shifts: [] }).find((d) => d.date === "2026-08-25")
    // The assignment still renders — only the time range is unknown.
    expect(day?.shift?.name).toBe("Day Shift")
    expect(day?.shift?.timeRange).toBe("")
    expect(day?.shift?.hours).toBe(0)
  })

  it("marks today and weekends", () => {
    const days = buildDayModels({
      dates: ["2026-08-21", "2026-08-22"],
      anchorMonth: "2026-08",
      todayIso: "2026-08-21",
      assignments: [],
      shifts: SHIFTS,
      holidays: [],
      leaves: [],
      swaps: [],
    })
    expect(days[0].isToday).toBe(true)
    expect(days[0].isWeekend).toBe(false)
    expect(days[1].isWeekend).toBe(true)
  })

  it("marks days outside the anchor month", () => {
    const days = buildDayModels({
      dates: ["2026-07-31", "2026-08-01"],
      anchorMonth: "2026-08",
      todayIso: "2026-08-21",
      assignments: [],
      shifts: SHIFTS,
      holidays: [],
      leaves: [],
      swaps: [],
    })
    expect(days[0].inAnchorMonth).toBe(false)
    expect(days[1].inAnchorMonth).toBe(true)
  })

  it("attaches a holiday name", () => {
    const days = build({
      holidays: [{ date: "2026-08-26", name: "Maulidur Rasul", type: "federal" }],
    })
    expect(days.find((d) => d.date === "2026-08-26")?.holidayName).toBe("Maulidur Rasul")
  })

  it("attaches approved leave spanning a range", () => {
    const days = build({
      leaves: [
        {
          id: "l1",
          employee_id: "e1",
          leave_type: "lt1",
          leave_type_code: "AL",
          start_date: "2026-08-24",
          end_date: "2026-08-26",
          total_days: "3",
          is_half_day: false,
          half_day_period: "",
          reason: "",
          status: "approved",
          current_level: 0,
          submitted_at: null,
          decided_at: null,
        },
      ],
    })
    expect(days.map((d) => d.leaveTypeCode)).toEqual(["AL", "AL", "AL"])
  })

  it("ignores leave that is not approved", () => {
    const days = build({
      leaves: [
        {
          id: "l1",
          employee_id: "e1",
          leave_type: "lt1",
          leave_type_code: "AL",
          start_date: "2026-08-24",
          end_date: "2026-08-24",
          total_days: "1",
          is_half_day: false,
          half_day_period: "",
          reason: "",
          status: "submitted",
          current_level: 0,
          submitted_at: null,
          decided_at: null,
        },
      ],
    })
    expect(days[0].leaveTypeCode).toBeNull()
  })

  it("keeps BOTH the shift and the leave when they collide", () => {
    // Leave approved after the roster was published is a real conflict the
    // employee must see — never hide the shift.
    const days = build({
      leaves: [
        {
          id: "l1",
          employee_id: "e1",
          leave_type: "lt1",
          leave_type_code: "AL",
          start_date: "2026-08-25",
          end_date: "2026-08-25",
          total_days: "1",
          is_half_day: false,
          half_day_period: "",
          reason: "",
          status: "approved",
          current_level: 0,
          submitted_at: null,
          decided_at: null,
        },
      ],
    })
    const day = days.find((d) => d.date === "2026-08-25")
    expect(day?.shift).not.toBeNull()
    expect(day?.leaveTypeCode).toBe("AL")
  })

  it("surfaces cover-up", () => {
    const days = build({
      assignments: [assignment({ covering_for: "e2", covering_for_name: "Aisyah Karim" })],
    })
    expect(days.find((d) => d.date === "2026-08-25")?.shift?.coveringForName).toBe("Aisyah Karim")
  })
})

describe("swapEligibility", () => {
  it("allows a future, published, scheduled shift", () => {
    const day = build().find((d) => d.date === "2026-08-25")
    expect(day?.swapEligibility).toEqual({ canSwap: true, reason: null })
  })

  it("reports no reason at all on a day with no shift", () => {
    const day = build().find((d) => d.date === "2026-08-24")
    expect(day?.swapEligibility).toEqual({ canSwap: false, reason: null })
  })

  it("refuses a past shift with the backend's wording", () => {
    const days = build({ todayIso: "2026-08-30" })
    expect(days.find((d) => d.date === "2026-08-25")?.swapEligibility).toEqual({
      canSwap: false,
      reason: "Only future shifts can be swapped.",
    })
  })

  it("refuses today's shift — the backend requires strictly future", () => {
    const days = build({ todayIso: "2026-08-25" })
    expect(days.find((d) => d.date === "2026-08-25")?.swapEligibility.canSwap).toBe(false)
  })

  it("refuses an unpublished shift", () => {
    const days = build({
      assignments: [assignment({ is_published: false, published_at: null })],
    })
    expect(days.find((d) => d.date === "2026-08-25")?.swapEligibility).toEqual({
      canSwap: false,
      reason: "Only published shifts can be swapped.",
    })
  })

  it("refuses a cancelled shift", () => {
    const days = build({ assignments: [assignment({ status: "cancelled" })] })
    expect(days.find((d) => d.date === "2026-08-25")?.swapEligibility).toEqual({
      canSwap: false,
      reason: "Only scheduled shifts can be swapped.",
    })
  })

  it("refuses when a swap is already pending on that assignment", () => {
    const days = build({
      swaps: [
        {
          id: "sw1",
          status: "pending",
          requester_assignment: { id: "a1" },
          counterparty_assignment: { id: "zzz" },
        },
      ],
    })
    const day = days.find((d) => d.date === "2026-08-25")
    expect(day?.hasPendingSwap).toBe(true)
    expect(day?.swapEligibility).toEqual({
      canSwap: false,
      reason: "There is already a pending swap for one of these shifts.",
    })
  })

  it("also matches a pending swap where this assignment is the counterparty", () => {
    const days = build({
      swaps: [
        {
          id: "sw1",
          status: "pending",
          requester_assignment: { id: "zzz" },
          counterparty_assignment: { id: "a1" },
        },
      ],
    })
    expect(days.find((d) => d.date === "2026-08-25")?.hasPendingSwap).toBe(true)
  })

  it("ignores a resolved swap", () => {
    const days = build({
      swaps: [
        {
          id: "sw1",
          status: "approved",
          requester_assignment: { id: "a1" },
          counterparty_assignment: { id: "zzz" },
        },
      ],
    })
    expect(days.find((d) => d.date === "2026-08-25")?.hasPendingSwap).toBe(false)
  })

  // The check order (no-shift → past → unpublished → not-scheduled →
  // pending-swap) is load-bearing: the UI must not promise a rule the
  // server does not enforce. Each case below violates two conditions at
  // once, so a reorder of the `if`s would change which reason wins and
  // break the assertion.
  describe("precedence when multiple conditions are violated", () => {
    it("past wins over unpublished", () => {
      const days = build({
        todayIso: "2026-08-30",
        assignments: [assignment({ is_published: false, published_at: null })],
      })
      expect(days.find((d) => d.date === "2026-08-25")?.swapEligibility).toEqual({
        canSwap: false,
        reason: "Only future shifts can be swapped.",
      })
    })

    it("past wins over not-scheduled", () => {
      const days = build({
        todayIso: "2026-08-30",
        assignments: [assignment({ status: "cancelled" })],
      })
      expect(days.find((d) => d.date === "2026-08-25")?.swapEligibility).toEqual({
        canSwap: false,
        reason: "Only future shifts can be swapped.",
      })
    })

    it("unpublished wins over not-scheduled", () => {
      const days = build({
        assignments: [assignment({ is_published: false, published_at: null, status: "cancelled" })],
      })
      expect(days.find((d) => d.date === "2026-08-25")?.swapEligibility).toEqual({
        canSwap: false,
        reason: "Only published shifts can be swapped.",
      })
    })

    it("unpublished wins over pending-swap", () => {
      const days = build({
        assignments: [assignment({ is_published: false, published_at: null })],
        swaps: [
          {
            id: "sw1",
            status: "pending",
            requester_assignment: { id: "a1" },
            counterparty_assignment: { id: "zzz" },
          },
        ],
      })
      expect(days.find((d) => d.date === "2026-08-25")?.swapEligibility).toEqual({
        canSwap: false,
        reason: "Only published shifts can be swapped.",
      })
    })

    it("no-shift wins over everything, even a pending swap elsewhere", () => {
      const days = build({
        swaps: [
          {
            id: "sw1",
            status: "pending",
            requester_assignment: { id: "a1" },
            counterparty_assignment: { id: "zzz" },
          },
        ],
      })
      // 2026-08-24 has no assignment in the default fixture; the pending
      // swap above belongs to "a1", which is scheduled on 2026-08-25.
      expect(days.find((d) => d.date === "2026-08-24")?.swapEligibility).toEqual({
        canSwap: false,
        reason: null,
      })
    })
  })
})
