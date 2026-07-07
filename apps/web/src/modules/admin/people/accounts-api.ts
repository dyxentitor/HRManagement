const BASE_URL = import.meta.env.VITE_API_BASE_URL || ""

export interface UserAccount {
  id: string
  email: string
  status: string
  is_active: boolean
  mfa_enabled: boolean
  last_login_at: string | null
  role_codes: string[]
  employee: { id: string; full_name: string; employee_code: string } | null
}

export type AccountStatusFilter = "active" | "disabled" | "needs_linking" | "archived" | "all"

async function authHeaders(): Promise<Record<string, string>> {
  const { tokenStorage } = await import("@/lib/token-storage")
  const token = tokenStorage.getAccess()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function req<T>(method: string, path: string): Promise<T> {
  const headers = await authHeaders()
  const res = await fetch(`${BASE_URL}${path}`, { method, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.errors?.[0]?.message || body?.detail || `Request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const accountsApi = {
  list: (status: AccountStatusFilter = "active") =>
    req<UserAccount[]>("GET", `/api/v1/users/?status=${status}`),
  retrieve: (id: string) => req<UserAccount>("GET", `/api/v1/users/${id}/`),
  disable: (id: string) => req<UserAccount>("POST", `/api/v1/users/${id}/disable/`),
  enable: (id: string) => req<UserAccount>("POST", `/api/v1/users/${id}/enable/`),
  remove: (id: string) => req<void>("DELETE", `/api/v1/users/${id}/`),
  restore: (id: string) => req<UserAccount>("POST", `/api/v1/users/${id}/restore/`),
}
