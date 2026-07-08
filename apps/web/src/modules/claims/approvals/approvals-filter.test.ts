import { describe, expect, it } from "vitest"

import type { ClaimApprovalRow } from "../api"
import { EMPTY_APPROVAL_FILTERS, applyApprovalFilters, paginate } from "./approvals-filter"

const row = (o: Partial<ClaimApprovalRow>): ClaimApprovalRow => ({
  id: "1",
  employee_name: "Alex Tan",
  employee_role_title: "Ops",
  employee_code: "E1",
  amount: "100",
  currency_code: "MYR",
  category_name: "Travel",
  merchant: "Grab",
  submitted_at: "2026-06-01T00:00:00Z",
  status: "submitted",
  stage_label: "Manager",
  attachments_count: 0,
  is_high_value: false,
  age_days: 2,
  is_overdue: false,
  actionable: true,
  ...o,
})

describe("approvals-filter", () => {
  const rows = [
    row({ id: "a", employee_name: "Alex Tan", amount: "100", is_overdue: false, age_days: 2 }),
    row({
      id: "b",
      employee_name: "Nurul Izzah",
      amount: "7000",
      is_high_value: true,
      is_overdue: true,
      age_days: 12,
      merchant: "Apple",
    }),
    row({ id: "c", employee_name: "Chin Wei", amount: "500", category_name: "Meals", age_days: 5 }),
  ]

  it("search matches name + merchant", () => {
    expect(
      applyApprovalFilters(rows, EMPTY_APPROVAL_FILTERS, "nurul", "newest").map((r) => r.id),
    ).toEqual(["b"])
    expect(
      applyApprovalFilters(rows, EMPTY_APPROVAL_FILTERS, "apple", "newest").map((r) => r.id),
    ).toEqual(["b"])
  })

  it("overdue + high-value filters", () => {
    expect(
      applyApprovalFilters(
        rows,
        { ...EMPTY_APPROVAL_FILTERS, overdueOnly: true },
        "",
        "newest",
      ).map((r) => r.id),
    ).toEqual(["b"])
    expect(
      applyApprovalFilters(
        rows,
        { ...EMPTY_APPROVAL_FILTERS, highValueOnly: true },
        "",
        "newest",
      ).map((r) => r.id),
    ).toEqual(["b"])
  })

  it("category + minAmount", () => {
    expect(
      applyApprovalFilters(
        rows,
        { ...EMPTY_APPROVAL_FILTERS, category: "Meals" },
        "",
        "newest",
      ).map((r) => r.id),
    ).toEqual(["c"])
    expect(
      applyApprovalFilters(rows, { ...EMPTY_APPROVAL_FILTERS, minAmount: 600 }, "", "newest").map(
        (r) => r.id,
      ),
    ).toEqual(["b"])
  })

  it("sorts", () => {
    expect(applyApprovalFilters(rows, EMPTY_APPROVAL_FILTERS, "", "amount")[0].id).toBe("b")
    expect(applyApprovalFilters(rows, EMPTY_APPROVAL_FILTERS, "", "urgency")[0].id).toBe("b") // overdue first
  })

  it("paginates", () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4])
  })
})
