import { ClaimReviewDrawer } from "@/modules/approvals/components/ClaimReviewDrawer"

import type { InboxItem } from "../../api"
import { IncentiveReviewDrawer } from "./IncentiveReviewDrawer"
import { KpiReviewDrawer } from "./KpiReviewDrawer"
import { LeaveReviewDrawer } from "./LeaveReviewDrawer"
import { ShiftSwapReviewDrawer } from "./ShiftSwapReviewDrawer"

/** Opens the right review drawer for a cross-type ("All") row, by kind. */
export function InboxReviewDrawer({
  item,
  onClose,
  onActed,
}: {
  item: InboxItem | null
  onClose: () => void
  onActed: () => void
}) {
  if (item?.kind === "claim")
    return <ClaimReviewDrawer claimId={item.id} onClose={onClose} onActed={onActed} />
  if (item?.kind === "leave")
    return <LeaveReviewDrawer item={item} onClose={onClose} onActed={onActed} />
  if (item?.kind === "kpi")
    return <KpiReviewDrawer item={item} onClose={onClose} onActed={onActed} />
  if (item?.kind === "incentive")
    return <IncentiveReviewDrawer item={item} onClose={onClose} onActed={onActed} />
  if (item?.kind === "shift_swap")
    return <ShiftSwapReviewDrawer item={item} onClose={onClose} onActed={onActed} />
  return null
}
