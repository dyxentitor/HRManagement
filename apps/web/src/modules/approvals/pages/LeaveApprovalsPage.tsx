import { PageHeader } from "@/components/shell/PageHeader"

import { ApprovalWorkspace } from "../workspace/ApprovalWorkspace"
import { leaveDescriptor } from "../workspace/workspace-descriptors"

export default function LeaveApprovalsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Leave" subtitle="Leave requests routed to you for approval." />
      <ApprovalWorkspace descriptor={leaveDescriptor} />
    </div>
  )
}
