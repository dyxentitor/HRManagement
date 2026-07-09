import { PageHeader } from "@/components/shell/PageHeader"

import { useApprovalsInbox } from "../ApprovalsShell"
import { ApprovalWorkspace } from "../workspace/ApprovalWorkspace"
import { kpiDescriptor } from "../workspace/workspace-descriptors"

export default function KpiApprovalsPage() {
  const inbox = useApprovalsInbox()
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="KPI" subtitle="KPI reviews routed to you for approval." />
      <ApprovalWorkspace inbox={inbox} filterKind="kpi" descriptor={kpiDescriptor} />
    </div>
  )
}
