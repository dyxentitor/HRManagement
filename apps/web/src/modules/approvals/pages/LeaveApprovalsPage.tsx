import { useMemo, useState } from "react"

import { PageHeader } from "@/components/shell/PageHeader"

import { useApprovalsInbox } from "../ApprovalsShell"
import { InboxToolbar } from "../components/InboxToolbar"
import { isInboxOverdue } from "../lib/inbox-filter"
import { InboxCardList } from "../segments/InboxCardList"

export default function LeaveApprovalsPage() {
  const inbox = useApprovalsInbox()
  const [search, setSearch] = useState("")
  const [overdueOnly, setOverdueOnly] = useState(false)
  const overdueCount = useMemo(
    () => inbox.items.filter((i) => i.kind === "leave").filter(isInboxOverdue).length,
    [inbox.items],
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Leave" subtitle="Leave requests routed to you for approval." />
      <InboxToolbar
        search={search}
        onSearch={setSearch}
        overdueOnly={overdueOnly}
        onToggleOverdue={() => setOverdueOnly((v) => !v)}
        overdueCount={overdueCount}
      />
      <InboxCardList
        inbox={inbox}
        onChanged={inbox.refresh}
        filterKind="leave"
        search={search}
        overdueOnly={overdueOnly}
        emptyLabel="No leave requests awaiting you."
      />
    </div>
  )
}
