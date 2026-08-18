import { useState } from "react"
import { toast } from "sonner"

import { DetailPanel } from "@/components/hrms"
import { Button } from "@/components/ui/button"

import { type InboxItem, approveItem, rejectItem } from "../../api"
import { friendlyActionError } from "../../lib/action-errors"

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "")
}

/** Review drawer for a pending shift-swap request in the unified inbox. */
export function ShiftSwapReviewDrawer({
  item,
  onClose,
  onActed,
}: {
  item: InboxItem | null
  onClose: () => void
  onActed: () => void
}) {
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)

  if (!item) return null
  const d = item.detail
  const itemId = item.id

  async function act(kind: "approve" | "reject") {
    if (kind === "reject" && !comment.trim()) {
      toast.error("A reason is required to reject")
      return
    }
    setBusy(true)
    try {
      if (kind === "approve") await approveItem("shift_swap", itemId, comment)
      else await rejectItem("shift_swap", itemId, comment)
      toast.success(kind === "approve" ? "Swap approved" : "Swap rejected")
      onActed()
    } catch (e) {
      toast.error(friendlyActionError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailPanel
      open
      title="Shift swap request"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => act("reject")} disabled={busy}>
            Reject
          </Button>
          <Button type="button" onClick={() => act("approve")} disabled={busy}>
            Approve
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-small">
        <p className="text-text-primary">
          {item.name} gives up {str(d.requester_date)} · {str(d.requester_shift)}
        </p>
        <p className="text-text-primary">
          {str(d.counterparty_name)} gives up {str(d.counterparty_date)} ·{" "}
          {str(d.counterparty_shift)}
        </p>
        {str(d.reason) && <p className="text-text-secondary">Reason: {str(d.reason)}</p>}
        <div>
          <label
            htmlFor="swap-decision-note"
            className="block text-label uppercase text-text-tertiary mb-1"
          >
            Note
          </label>
          <textarea
            id="swap-decision-note"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="w-full bg-surface border border-border-subtle rounded px-2 py-1 text-text-primary text-small"
          />
        </div>
      </div>
    </DetailPanel>
  )
}
