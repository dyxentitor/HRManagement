import { useState } from "react"

import { PageHeader } from "@/components/shell/PageHeader"

import { useApprovalsInbox } from "../ApprovalsShell"
import { InboxToolbar } from "../components/InboxToolbar"
import { InboxCardList } from "../segments/InboxCardList"

export default function KpiApprovalsPage() {
  const inbox = useApprovalsInbox()
  const [search, setSearch] = useState("")

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="KPI" subtitle="KPI reviews routed to you for approval." />
      <InboxToolbar search={search} onSearch={setSearch} />
      <InboxCardList
        inbox={inbox}
        onChanged={inbox.refresh}
        filterKind="kpi"
        search={search}
        emptyLabel="No KPI reviews awaiting you."
      />
    </div>
  )
}
