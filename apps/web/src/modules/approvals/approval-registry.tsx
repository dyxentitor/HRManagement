import type { FC } from "react"

import { ClaimsSegment } from "@/modules/claims/approvals/ClaimsSegment"

import type { InboxItem } from "./api"
import { AllSegment } from "./segments/AllSegment"
import { KpiSegment } from "./segments/KpiSegment"
import { LeaveSegment } from "./segments/LeaveSegment"
import type { SegmentProps } from "./segments/types"

export type SegmentKey = "all" | "claim" | "leave" | "kpi"

export interface ApprovalSegmentDescriptor {
  key: SegmentKey
  label: string
  /** Visible if the user holds any of these perms ("" = always) … */
  anyPerm: string[]
  /** …or if this badge count > 0. */
  badge?: (items: InboxItem[]) => number
  Component: FC<SegmentProps>
}

const claimBadge = (items: InboxItem[]) => items.filter((i) => i.kind === "claim").length
const leaveBadge = (items: InboxItem[]) => items.filter((i) => i.kind === "leave").length
const kpiBadge = (items: InboxItem[]) => items.filter((i) => i.kind === "kpi").length

/** The claims segment ignores the shared inbox and self-fetches its richer data. */
const ClaimsSegmentAdapter: FC<SegmentProps> = ({ onChanged }) => (
  <ClaimsSegment onChanged={onChanged} />
)

export const APPROVAL_SEGMENTS: ApprovalSegmentDescriptor[] = [
  { key: "all", label: "All", anyPerm: [""], Component: AllSegment },
  {
    key: "claim",
    label: "Claims",
    anyPerm: ["claim:approve:team", "claim:approve:finance"],
    badge: claimBadge,
    Component: ClaimsSegmentAdapter,
  },
  {
    key: "leave",
    label: "Leave",
    anyPerm: ["leave:approve:team"],
    badge: leaveBadge,
    Component: LeaveSegment,
  },
  { key: "kpi", label: "KPI", anyPerm: [], badge: kpiBadge, Component: KpiSegment },
]
