import { useMemo, useState } from "react"

import { PageHeader } from "@/components/shell/PageHeader"

import { useApprovalsInbox } from "../ApprovalsShell"
import { InboxToolbar } from "../components/InboxToolbar"
import { isInboxOverdue } from "../lib/inbox-filter"
import { InboxCardList } from "../segments/InboxCardList"

export default function AllApprovalsPage() {
  const inbox = useApprovalsInbox()
  const [search, setSearch] = useState("")
  const [overdueOnly, setOverdueOnly] = useState(false)
  const overdueCount = useMemo(() => inbox.items.filter(isInboxOverdue).length, [inbox.items])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Approvals"
        subtitle="Everything awaiting your review — across claims, leave and KPI."
      />
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
        search={search}
        overdueOnly={overdueOnly}
        emptyLabel="All caught up. Nothing awaiting your approval. 🎉"
      />
    </div>
  )
}
