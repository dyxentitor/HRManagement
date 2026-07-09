/** Turn a raw approval-action error into a clear, user-facing message.
 *
 * The backend rejects actions on claims that are no longer awaiting the caller:
 *   - already resolved/cancelled  → 400 "Cannot act on status='…'" (InvalidTransition)
 *   - moved to a stage they don't handle → 403 "…lacks … for pool level N"
 * Both mean the queue is stale, so callers should also refresh after showing this. */
export function friendlyActionError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "")
  if (/cannot act on status|invalid workflow transition/i.test(msg)) {
    return "This request was already actioned — refreshing your queue."
  }
  if (/not authorized|lacks .*(perm|pool)|pool level/i.test(msg)) {
    return "This request moved to a stage you don't handle — refreshing your queue."
  }
  return msg || "Action failed."
}
