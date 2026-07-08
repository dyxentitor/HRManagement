import { PageHeader } from "@/components/shell/PageHeader"
import { ClaimsSegment } from "@/modules/claims/approvals/ClaimsSegment"

import { useApprovalsInbox } from "../ApprovalsShell"

export default function ClaimsApprovalsPage() {
  const inbox = useApprovalsInbox()
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Claims" subtitle="Review and act on claims routed to you." />
      <ClaimsSegment onChanged={inbox.refresh} />
    </div>
  )
}
