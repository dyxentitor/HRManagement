import { InboxCardList } from "./InboxCardList"
import type { SegmentProps } from "./types"

export function KpiSegment(props: SegmentProps) {
  return <InboxCardList {...props} filterKind="kpi" emptyLabel="No KPI reviews awaiting you." />
}
