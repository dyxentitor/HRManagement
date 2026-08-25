import { authedFetch } from "@/lib/authed-fetch"

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ""
const ROOT = `${BASE_URL}/api/v1/schedule/swap-requests/`

/** One side of a swap — the shape both the request list and the picker share. */
export type AssignmentBrief = {
  id: string
  employee: string
  employee_code: string
  employee_name: string
  shift: string
  shift_name: string
  shift_code: string
  /** "HH:MM:SS" */
  shift_start: string
  shift_end: string
  shift_crosses_midnight: boolean
  work_date: string
}

/** A teammate's shift as offered by the picker, with the server's verdict on it. */
export type SwapCandidate = AssignmentBrief & {
  department_name: string | null
  team_name: string | null
  /** The server's preview verdict. Re-checked authoritatively at submit. */
  compatible: boolean
  incompatible_reason: string | null
  /** Soft flags (overnight, longer/shorter) — never a reason to block. */
  warnings: string[]
}

export type SwapCandidatePage = {
  results: SwapCandidate[]
  count: number
  page: number
  page_size: number
  /** Set when the employee's OWN shift can't be swapped at all. */
  blocked_reason: string | null
}

export type SwapStatus = "pending" | "approved" | "rejected" | "cancelled"

export type SwapRequest = {
  id: string
  requester: string
  requester_assignment: AssignmentBrief
  requester_name: string
  counterparty: string
  counterparty_assignment: AssignmentBrief
  counterparty_name: string
  reason: string
  status: SwapStatus
  decided_by: string | null
  decided_at: string | null
  decision_note: string
  created_at: string
}

export interface SwapCandidateQuery {
  assignmentId: string
  /** Server-side autocomplete; ignored by the API below 2 characters. */
  q?: string
  dateFrom?: string
  dateTo?: string
  shift?: string
  team?: string
  department?: string
  page?: number
  pageSize?: number
}

/** Pull the RFC 7807 `detail` (or DRF `errors[0].message`) out of a failed response. */
async function failureMessage(resp: Response, fallback: string): Promise<string> {
  try {
    const body = await resp.json()
    if (typeof body?.detail === "string") return body.detail
    if (typeof body?.errors?.[0]?.message === "string") return body.errors[0].message
  } catch {
    // non-JSON body — fall through
  }
  return fallback
}

/**
 * One page of compatible teammate shifts. Everything — search, filters and
 * paging — is resolved server-side; the browser never receives the full roster.
 */
export async function listSwapCandidates(query: SwapCandidateQuery): Promise<SwapCandidatePage> {
  const params = new URLSearchParams({ assignment_id: query.assignmentId })
  const optional: [string, string | number | undefined][] = [
    ["q", query.q],
    ["date_from", query.dateFrom],
    ["date_to", query.dateTo],
    ["shift", query.shift],
    ["team", query.team],
    ["department", query.department],
    ["page", query.page],
    ["page_size", query.pageSize],
  ]
  for (const [key, value] of optional) {
    if (value !== undefined && value !== "") params.set(key, String(value))
  }

  const resp = await authedFetch(`${ROOT}candidates/?${params.toString()}`)
  if (!resp.ok) throw new Error(await failureMessage(resp, "Could not load teammates"))
  return resp.json()
}

export async function listMySwapRequests(): Promise<SwapRequest[]> {
  const resp = await authedFetch(ROOT)
  if (!resp.ok) throw new Error(await failureMessage(resp, "Could not load swap requests"))
  return resp.json()
}

export async function createSwapRequest(input: {
  requesterAssignmentId: string
  counterpartyAssignmentId: string
  reason: string
}): Promise<SwapRequest> {
  const resp = await authedFetch(ROOT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requester_assignment: input.requesterAssignmentId,
      counterparty_assignment: input.counterpartyAssignmentId,
      reason: input.reason,
    }),
  })
  if (!resp.ok) throw new Error(await failureMessage(resp, "Swap request failed"))
  return resp.json()
}

export async function cancelSwapRequest(id: string): Promise<void> {
  const resp = await authedFetch(`${ROOT}${encodeURIComponent(id)}/cancel/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  if (!resp.ok) throw new Error(await failureMessage(resp, "Could not cancel the request"))
}
