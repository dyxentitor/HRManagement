import type { ClaimApprovalRow } from "../api"

export type ApprovalSort = "urgency" | "newest" | "amount"

export interface ApprovalFilters {
  category: string | null
  minAmount: number | null
  overdueOnly: boolean
  highValueOnly: boolean
}

export const EMPTY_APPROVAL_FILTERS: ApprovalFilters = {
  category: null,
  minAmount: null,
  overdueOnly: false,
  highValueOnly: false,
}

export function hasActiveApprovalFilters(f: ApprovalFilters): boolean {
  return f.category !== null || f.minAmount !== null || f.overdueOnly || f.highValueOnly
}

function matches(row: ClaimApprovalRow, f: ApprovalFilters, search: string): boolean {
  if (f.category && row.category_name !== f.category) return false
  if (f.minAmount !== null && Number(row.amount) < f.minAmount) return false
  if (f.overdueOnly && !row.is_overdue) return false
  if (f.highValueOnly && !row.is_high_value) return false
  const q = search.trim().toLowerCase()
  if (q) {
    const hay = `${row.employee_name} ${row.merchant} ${row.category_name} ${row.id}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

function sortRows(rows: ClaimApprovalRow[], sort: ApprovalSort): ClaimApprovalRow[] {
  const out = [...rows]
  if (sort === "newest") {
    out.sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""))
  } else if (sort === "amount") {
    out.sort((a, b) => Number(b.amount) - Number(a.amount))
  } else {
    // urgency: overdue first, then oldest (highest age) first
    out.sort((a, b) => Number(b.is_overdue) - Number(a.is_overdue) || b.age_days - a.age_days)
  }
  return out
}

export function applyApprovalFilters(
  rows: ClaimApprovalRow[],
  filters: ApprovalFilters,
  search: string,
  sort: ApprovalSort,
): ClaimApprovalRow[] {
  return sortRows(
    rows.filter((r) => matches(r, filters, search)),
    sort,
  )
}

export function paginate<T>(rows: T[], page: number, size: number): T[] {
  const start = (page - 1) * size
  return rows.slice(start, start + size)
}
