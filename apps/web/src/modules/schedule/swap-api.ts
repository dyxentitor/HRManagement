import { authedFetch } from "@/lib/authed-fetch"

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ""
const ROOT = `${BASE_URL}/api/v1/schedule/swap-requests/`

export type SwapCandidate = {
  id: string
  employee: string
  employee_code: string
  employee_name: string
  shift: string
  shift_name: string
  shift_code: string
  work_date: string
}

export type SwapRequest = {
  id: string
  requester: string
  requester_assignment: SwapCandidate
  requester_name: string
  counterparty: string
  counterparty_assignment: SwapCandidate
  counterparty_name: string
  reason: string
  status: "pending" | "approved" | "rejected" | "cancelled"
  decided_by: string | null
  decided_at: string | null
  decision_note: string
  created_at: string
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

export async function listSwapCandidates(assignmentId: string): Promise<SwapCandidate[]> {
  const resp = await authedFetch(
    `${ROOT}candidates/?assignment_id=${encodeURIComponent(assignmentId)}`,
  )
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
