import { AlertTriangle, Flame } from "lucide-react"

import { leaveApi } from "@/modules/leave/api"

import { byLongest, byNewest, byUrgency, rowConflict, rowOverdue } from "../lib/inbox-filter"
import type { WorkspaceDescriptor, WorkspaceLens, WorkspaceSort } from "./ApprovalWorkspace"
import { InboxReviewDrawer } from "./drawers/InboxReviewDrawer"
import { KpiReviewDrawer } from "./drawers/KpiReviewDrawer"
import { LeaveReviewDrawer } from "./drawers/LeaveReviewDrawer"

const overdueLens: WorkspaceLens = {
  key: "overdue",
  label: "Overdue",
  icon: Flame,
  tone: "coral",
  predicate: (i) => rowOverdue(i),
}

const conflictLens: WorkspaceLens = {
  key: "conflict",
  label: "Conflict",
  icon: AlertTriangle,
  tone: "amber",
  predicate: (i, ctx) => rowConflict(i, ctx.clashes),
}

const urgencySort: WorkspaceSort = {
  key: "urgency",
  label: "Urgency",
  make: (ctx) => byUrgency(ctx.clashes),
}
const newestSort: WorkspaceSort = { key: "newest", label: "Newest", make: () => byNewest }
const longestSort: WorkspaceSort = { key: "longest", label: "Longest", make: () => byLongest }

export const leaveDescriptor: WorkspaceDescriptor = {
  emptyLabel: "No leave requests here.",
  lenses: [overdueLens, conflictLens],
  sorts: [urgencySort, newestSort, longestSort],
  queue: {
    tabs: [
      { key: "awaiting", label: "Awaiting" },
      { key: "approved", label: "Approved" },
      { key: "rejected", label: "Rejected" },
      { key: "all", label: "All" },
    ],
    fetchTab: (tab) => leaveApi.approvalsQueue(tab),
    fetchSummary: () => leaveApi.approvalsSummary(),
    lensCount: (s, key) =>
      key === "overdue" ? (s.overdue_count ?? 0) : key === "conflict" ? (s.conflict_count ?? 0) : 0,
  },
  DetailDrawer: LeaveReviewDrawer,
}

export const kpiDescriptor: WorkspaceDescriptor = {
  emptyLabel: "No KPI reviews awaiting you.",
  lenses: [overdueLens],
  sorts: [urgencySort, newestSort],
  DetailDrawer: KpiReviewDrawer,
}

export const allDescriptor: WorkspaceDescriptor = {
  emptyLabel: "All caught up. Nothing awaiting your approval. 🎉",
  lenses: [overdueLens],
  sorts: [urgencySort, newestSort],
  typeFilter: true,
  DetailDrawer: InboxReviewDrawer,
}
