import { InboxCardList } from "./InboxCardList"
import type { SegmentProps } from "./types"

export function AllSegment(props: SegmentProps) {
  return <InboxCardList {...props} emptyLabel="All caught up. Nothing awaiting your approval. 🎉" />
}
