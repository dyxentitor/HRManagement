import { describe, expect, it } from "vitest"

import {
  addMonthsIso,
  monthGridDays,
  rangeFor,
  rangeLabel,
  shiftAnchor,
  startOfWeekIso,
} from "./schedule-range"

describe("startOfWeekIso", () => {
  it("returns Monday for a mid-week date", () => {
    // 2026-08-21 is a Friday.
    expect(startOfWeekIso("2026-08-21")).toBe("2026-08-17")
  })

  it("returns the same date when already Monday", () => {
    expect(startOfWeekIso("2026-08-17")).toBe("2026-08-17")
  })

  it("treats Sunday as the end of its week, not the start", () => {
    // 2026-08-23 is a Sunday; its Monday is the 17th.
    expect(startOfWeekIso("2026-08-23")).toBe("2026-08-17")
  })
})

describe("addMonthsIso", () => {
  it("moves forward and normalises to the first of the month", () => {
    expect(addMonthsIso("2026-08-21", 1)).toBe("2026-09-01")
  })

  it("moves backward across a year boundary", () => {
    expect(addMonthsIso("2026-01-15", -1)).toBe("2025-12-01")
  })

  it("moves forward across a year boundary", () => {
    expect(addMonthsIso("2026-12-05", 1)).toBe("2027-01-01")
  })
})

describe("monthGridDays", () => {
  it("covers whole Monday-first weeks for a 31-day month", () => {
    const days = monthGridDays("2026-08-15")
    // Aug 2026 starts Saturday, ends Monday 31st.
    expect(days[0]).toBe("2026-07-27")
    expect(days[days.length - 1]).toBe("2026-09-06")
    expect(days.length % 7).toBe(0)
    expect(days).toContain("2026-08-01")
    expect(days).toContain("2026-08-31")
  })

  it("handles a February in a leap year", () => {
    const days = monthGridDays("2028-02-10")
    // Feb 2028 has 29 days; 2028-02-29 is a Tuesday, so the grid's last
    // Monday-first week runs through Sunday 2028-03-05.
    expect(days).toContain("2028-02-29")
    expect(days[days.length - 1]).toBe("2028-03-05")
    expect(days.length % 7).toBe(0)
  })

  it("handles a February in a non-leap year", () => {
    const days = monthGridDays("2026-02-10")
    expect(days).toContain("2026-02-28")
    expect(days).not.toContain("2026-02-29")
  })

  it("produces no duplicate dates", () => {
    const days = monthGridDays("2026-08-15")
    expect(new Set(days).size).toBe(days.length)
  })
})

describe("rangeFor", () => {
  it("returns the seven days of the anchor's week", () => {
    expect(rangeFor("week", "2026-08-21")).toEqual({
      from: "2026-08-17",
      to: "2026-08-23",
    })
  })

  it("returns the whole month grid for month view", () => {
    expect(rangeFor("month", "2026-08-15")).toEqual({
      from: "2026-07-27",
      to: "2026-09-06",
    })
  })

  it("gives agenda the same range as month so nav means one thing", () => {
    expect(rangeFor("agenda", "2026-08-15")).toEqual(rangeFor("month", "2026-08-15"))
  })
})

describe("rangeLabel", () => {
  it("labels a month", () => {
    expect(rangeLabel("month", "2026-08-15")).toBe("August 2026")
  })

  it("labels a week inside one month without repeating the month", () => {
    expect(rangeLabel("week", "2026-08-21")).toBe("17 – 23 August 2026")
  })

  it("labels a week that straddles two months", () => {
    // 2026-08-31 is a Monday; that week runs into September.
    // This runtime's en-MY CLDR data abbreviates September as "Sept".
    expect(rangeLabel("week", "2026-08-31")).toBe("31 Aug – 6 Sept 2026")
  })
})

describe("shiftAnchor", () => {
  it("steps a week at a time in week view", () => {
    expect(shiftAnchor("week", "2026-08-21", 1)).toBe("2026-08-24")
    expect(shiftAnchor("week", "2026-08-21", -1)).toBe("2026-08-10")
  })

  it("steps a month at a time in month and agenda view", () => {
    expect(shiftAnchor("month", "2026-08-15", 1)).toBe("2026-09-01")
    expect(shiftAnchor("agenda", "2026-08-15", -1)).toBe("2026-07-01")
  })
})
