import type { UseApprovalInbox } from "../useApprovalInbox"

/** Every Approval Center segment gets the shared inbox (All/Leave/KPI use it; the
 * Claims segment ignores it and self-fetches) plus a refresh callback for the rail. */
export interface SegmentProps {
  inbox: UseApprovalInbox
  onChanged: () => void
}
