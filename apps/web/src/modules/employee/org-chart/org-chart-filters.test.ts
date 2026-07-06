import { describe, expect, it } from "vitest"
import { EMPTY_FILTERS, hasActiveFilters, matchesFilters } from "./org-chart-filters"
import type { OrgNode } from "./types"

const node = (o: Partial<OrgNode>): OrgNode => ({
  id: "1",
  full_name: "X",
  direct_reports_count: 0,
  has_reports: false,
  department_id: "d1",
  employment_type: "fulltime",
  status: "active",
  ...o,
})

describe("matchesFilters", () => {
  it("passes everything when empty", () => {
    expect(matchesFilters(node({}), EMPTY_FILTERS)).toBe(true)
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
  })
  it("filters by department", () => {
    const f = { ...EMPTY_FILTERS, department: "d1" }
    expect(matchesFilters(node({ department_id: "d1" }), f)).toBe(true)
    expect(matchesFilters(node({ department_id: "d2" }), f)).toBe(false)
    expect(hasActiveFilters(f)).toBe(true)
  })
  it("filters by employment type", () => {
    const f = { ...EMPTY_FILTERS, employmentType: "intern" }
    expect(matchesFilters(node({ employment_type: "intern" }), f)).toBe(true)
    expect(matchesFilters(node({ employment_type: "fulltime" }), f)).toBe(false)
  })
  it("filters by status", () => {
    const f = { ...EMPTY_FILTERS, status: "active" }
    expect(matchesFilters(node({ status: "probation" }), f)).toBe(false)
    expect(matchesFilters(node({ status: "active" }), f)).toBe(true)
  })
})
