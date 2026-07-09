import { PageHeader } from "@/components/shell/PageHeader"

import { useApprovalsInbox } from "../ApprovalsShell"
import { ApprovalWorkspace } from "../workspace/ApprovalWorkspace"
import { leaveDescriptor } from "../workspace/workspace-descriptors"

export default function LeaveApprovalsPage() {
  const inbox = useApprovalsInbox()
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Leave" subtitle="Leave requests routed to you for approval." />
      <ApprovalWorkspace inbox={inbox} filterKind="leave" descriptor={leaveDescriptor} />
    </div>
  )
}
