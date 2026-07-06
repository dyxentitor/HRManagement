import type { OrgNode } from "./types"

export interface OrgFilters {
  department: string | null
  employmentType: string | null
  status: string | null
}

export const EMPTY_FILTERS: OrgFilters = {
  department: null,
  employmentType: null,
  status: null,
}

export function hasActiveFilters(f: OrgFilters): boolean {
  return f.department !== null || f.employmentType !== null || f.status !== null
}

export function matchesFilters(node: OrgNode, f: OrgFilters): boolean {
  if (f.department && node.department_id !== f.department) return false
  if (f.employmentType && node.employment_type !== f.employmentType) return false
  if (f.status && node.status !== f.status) return false
  return true
}
