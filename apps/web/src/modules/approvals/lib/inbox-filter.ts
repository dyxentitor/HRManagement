import type { InboxItem } from "../api"

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
