import type { InboxItem } from "../api"
import type { Clash } from "../useApprovalInbox"

/** An inbox item is "overdue" once it has been awaiting action for longer than
 * this many days. Mirrors the claims queue OVERDUE_DAYS (backend). */
const OVERDUE_DAYS = 3

export function isInboxOverdue(item: InboxItem, now = Date.now()): boolean {
  if (!item.submitted_at) return false
  const t = Date.parse(item.submitted_at)
  if (Number.isNaN(t)) return false
  return now - t > OVERDUE_DAYS * 86_400_000
}

/** Case-insensitive match across the human-facing fields of an inbox item.
 * Empty / whitespace query matches everything. */
export function matchesInboxSearch(item: InboxItem, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return [item.name, item.department, item.type_code, item.summary, item.employee_code].some((f) =>
    (f ?? "").toLowerCase().includes(s),
  )
}

/** A leave item "conflicts" when teammates are already off during its dates. */
export function hasCoverageClash(id: string, clashes: Map<string, Clash>): boolean {
  return (clashes.get(id)?.count ?? 0) > 0
}

const submittedMs = (i: InboxItem): number => (i.submitted_at ? Date.parse(i.submitted_at) : 0)

/** Newest submission first. */
export function byNewest(a: InboxItem, b: InboxItem): number {
  return submittedMs(b) - submittedMs(a)
}

/** Longest duration first (leave — by total_days). */
export function byLongest(a: InboxItem, b: InboxItem): number {
  return Number(b.detail.total_days ?? 0) - Number(a.detail.total_days ?? 0)
}

/** Most urgent first: overdue + coverage-clash weighted, then oldest submission. */
export function byUrgency(clashes: Map<string, Clash>) {
  const weight = (i: InboxItem): number =>
    (isInboxOverdue(i) ? 2 : 0) + (hasCoverageClash(i.id, clashes) ? 1 : 0)
  return (a: InboxItem, b: InboxItem): number =>
    weight(b) - weight(a) || submittedMs(a) - submittedMs(b)
}
