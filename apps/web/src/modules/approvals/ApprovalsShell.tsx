import { Outlet, useOutletContext } from "react-router-dom"

import { ApprovalsNav } from "./ApprovalsNav"
import type { ApprovalsCountKey } from "./approvals-nav-config"
import { type UseApprovalInbox, useApprovalInbox } from "./useApprovalInbox"

/** Approval Center layout — mirrors PeopleShell / SettingsShell. Owns the shared
 * inbox (one fetch), feeds per-type counts to the nav, and passes the inbox to
 * child pages via outlet context. The Claims page ignores it and self-fetches. */
export default function ApprovalsShell() {
  const inbox = useApprovalInbox()
  const counts: Record<ApprovalsCountKey, number> = {
    all: inbox.items.length,
    claim: inbox.items.filter((i) => i.kind === "claim").length,
    leave: inbox.items.filter((i) => i.kind === "leave").length,
    kpi: inbox.items.filter((i) => i.kind === "kpi").length,
    incentive: inbox.items.filter((i) => i.kind === "incentive").length,
    shift_swap: inbox.items.filter((i) => i.kind === "shift_swap").length,
  }
  return (
    <div className="flex flex-col md:flex-row gap-3 min-h-[calc(100vh-32px)]">
      <ApprovalsNav counts={counts} />
      {/* Not <main> — AppShell already owns the single main landmark. */}
      <div className="flex-1 min-w-0 bg-surface rounded-lg p-6 overflow-auto">
        <Outlet context={inbox} />
      </div>
    </div>
  )
}

/** Child pages read the shared inbox from the shell's outlet context. */
export function useApprovalsInbox(): UseApprovalInbox {
  return useOutletContext<UseApprovalInbox>()
}
