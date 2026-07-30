import { Inbox, Palmtree, ReceiptText, Target } from "lucide-react"
import type { ComponentType } from "react"

export type ApprovalsCountKey = "all" | "claim" | "leave" | "kpi" | "incentive"

export interface ApprovalsNavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** Item shows if the user holds any of these perms OR its count > 0. Empty = the
   * always-visible "All" landing (like People's Directory / Settings' Overview). */
  anyPerm: string[]
  countKey: ApprovalsCountKey
  end?: boolean
}

export const APPROVALS_NAV_ITEMS: ApprovalsNavItem[] = [
  {
    to: "/approvals",
    label: "All Approvals",
    icon: Inbox,
    anyPerm: [],
    countKey: "all",
    end: true,
  },
  {
    to: "/approvals/claims",
    label: "Claims",
    icon: ReceiptText,
    anyPerm: ["claim:approve:team", "claim:approve:finance"],
    countKey: "claim",
  },
  {
    to: "/approvals/leave",
    label: "Leave",
    icon: Palmtree,
    anyPerm: ["leave:request:approve:team"],
    countKey: "leave",
  },
  { to: "/approvals/kpi", label: "KPI", icon: Target, anyPerm: [], countKey: "kpi" },
]
