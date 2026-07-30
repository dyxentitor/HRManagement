import { PageHeader } from "@/components/shell/PageHeader"

import { useApprovalsInbox } from "../ApprovalsShell"
import { ApprovalWorkspace } from "../workspace/ApprovalWorkspace"
import { allDescriptor } from "../workspace/workspace-descriptors"

export default function AllApprovalsPage() {
  const inbox = useApprovalsInbox()
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Approvals"
        subtitle="Everything awaiting your review — across claims, leave, KPI and mandays."
      />
      <ApprovalWorkspace inbox={inbox} descriptor={allDescriptor} />
    </div>
  )
}
