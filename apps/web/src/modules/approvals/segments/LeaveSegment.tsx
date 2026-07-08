import { InboxCardList } from "./InboxCardList"
import type { SegmentProps } from "./types"

export function LeaveSegment(props: SegmentProps) {
  return (
    <InboxCardList {...props} filterKind="leave" emptyLabel="No leave requests awaiting you." />
  )
}
