import { describe, expect, it } from "vitest"

import type { InboxItem } from "../api"
import type { Clash } from "../useApprovalInbox"
import {
  byLongest,
  byNewest,
  byUrgency,
  hasCoverageClash,
  isInboxOverdue,
  matchesInboxSearch,
} from "./inbox-filter"

const NOW = Date.parse("2026-07-08T00:00:00Z")

function item(over: Partial<InboxItem> = {}): InboxItem {
  return {
    kind: "claim",
    id: "c1",
    employee_code: "E1",
    summary: "Taxi to client",
    submitted_at: null,
    deep_link: "",
    employee_id: "e1",
    name: "Nurul Aisyah",
    department: "Operations",
    type_code: "TRAVEL",
    detail: {},
    ...over,
  }
}

describe("isInboxOverdue", () => {
  it("is true when submitted more than 3 days ago", () => {
    expect(isInboxOverdue(item({ submitted_at: "2026-07-01T00:00:00Z" }), NOW)).toBe(true)
  })
  it("is false when recent", () => {
    expect(isInboxOverdue(item({ submitted_at: "2026-07-07T00:00:00Z" }), NOW)).toBe(false)
  })
  it("is false when submitted_at is null or unparseable", () => {
    expect(isInboxOverdue(item({ submitted_at: null }), NOW)).toBe(false)
    expect(isInboxOverdue(item({ submitted_at: "not-a-date" }), NOW)).toBe(false)
  })
})

describe("matchesInboxSearch", () => {
  it("matches nothing-excluded on empty query", () => {
    expect(matchesInboxSearch(item(), "")).toBe(true)
    expect(matchesInboxSearch(item(), "   ")).toBe(true)
  })
  it("matches name/department/type case-insensitively", () => {
    expect(matchesInboxSearch(item(), "nurul")).toBe(true)
    expect(matchesInboxSearch(item(), "OPERATIONS")).toBe(true)
    expect(matchesInboxSearch(item(), "travel")).toBe(true)
  })
  it("excludes non-matches", () => {
    expect(matchesInboxSearch(item(), "zzz")).toBe(false)
  })
})

describe("lenses + sorts", () => {
  const clashes = new Map<string, Clash>([["a", { count: 2, names: ["Bea"] }]])

  it("hasCoverageClash reflects the clash map", () => {
    expect(hasCoverageClash("a", clashes)).toBe(true)
    expect(hasCoverageClash("b", clashes)).toBe(false)
  })

  it("byNewest orders newest submission first", () => {
    const older = item({ id: "o", submitted_at: "2026-07-01T00:00:00Z" })
    const newer = item({ id: "n", submitted_at: "2026-07-08T00:00:00Z" })
    expect([older, newer].sort(byNewest)[0].id).toBe("n")
  })

  it("byLongest orders by total_days", () => {
    const short = item({ id: "s", detail: { total_days: "1" } })
    const long = item({ id: "l", detail: { total_days: "5" } })
    expect([short, long].sort(byLongest)[0].id).toBe("l")
  })

  it("byUrgency puts overdue+clash first, then oldest", () => {
    const overdueClash = item({ id: "a", submitted_at: "2026-06-01T00:00:00Z" }) // in clashes + old
    const recent = item({ id: "b", submitted_at: "2026-07-08T00:00:00Z" })
    const sorted = [recent, overdueClash].sort(byUrgency(clashes))
    expect(sorted[0].id).toBe("a")
  })
})
