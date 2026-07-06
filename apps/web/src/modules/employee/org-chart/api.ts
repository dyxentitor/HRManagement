import type { DepartmentGroup, OrgNode, OrgSearchHit } from "./types"

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ""
const BASE = "/api/v1/org-chart"

async function authHeaders(): Promise<Record<string, string>> {
  const { tokenStorage } = await import("@/lib/token-storage")
  const token = tokenStorage.getAccess()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function get<T>(path: string): Promise<T> {
  const headers = await authHeaders()
  const res = await fetch(`${BASE_URL}${path}`, { headers })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json() as Promise<T>
}

export const orgChartApi = {
  roots: () => get<OrgNode[]>(`${BASE}/roots/`),
  children: (managerId: string) =>
    get<OrgNode[]>(`${BASE}/children/?manager=${encodeURIComponent(managerId)}`),
  search: (q: string) => get<OrgSearchHit[]>(`${BASE}/search/?q=${encodeURIComponent(q)}`),
  departments: () => get<DepartmentGroup[]>(`${BASE}/departments/`),
  departmentMembers: (deptId: string) =>
    get<OrgNode[]>(`${BASE}/departments/${encodeURIComponent(deptId)}/members/`),
}
