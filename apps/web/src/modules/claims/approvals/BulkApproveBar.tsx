import { Check } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { type ClaimApprovalRow, claimsApi } from "../api"

export interface BulkApproveBarProps {
  selected: ClaimApprovalRow[]
  onClear: () => void
  onDone: () => void
}

export function BulkApproveBar({ selected, onClear, onDone }: BulkApproveBarProps) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  if (selected.length === 0) return null

  const total = selected.reduce((sum, r) => sum + Number(r.amount || 0), 0)
  const highValue = selected.filter((r) => r.is_high_value).length

  async function run() {
    setConfirm(false)
    setBusy(true)
    const results = await Promise.allSettled(selected.map((r) => claimsApi.approve(r.id, "")))
    const approved = results.filter((r) => r.status === "fulfilled").length
    const skipped = results.length - approved
    setBusy(false)
    toast.success(
      skipped > 0
        ? `${approved} approved · ${skipped} skipped (not at your stage)`
        : `${approved} approved`,
    )
    onDone()
  }

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-2xl border border-border-strong bg-surface-elevated/95 backdrop-blur px-4 py-2.5 shadow-panel">
        <span className="text-small text-text-primary">
          <b>{selected.length}</b> selected{" "}
          <span className="text-text-tertiary">
            · RM {total.toLocaleString("en-MY", { maximumFractionDigits: 0 })}
          </span>
        </span>
        {highValue > 0 && (
          <span className="text-[10px] bg-yellow/15 text-yellow rounded-full px-2 py-0.5">
            {highValue} high-value
          </span>
        )}
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => setConfirm(true)}
          className="soft-glow"
        >
          <Check className="size-4 mr-1" /> Approve {selected.length}
        </Button>
        <button
          type="button"
          onClick={onClear}
          className="text-small text-text-tertiary hover:text-text-primary"
        >
          Clear
        </button>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Approve ${selected.length} claims?`}
        description={
          `Total RM ${total.toLocaleString("en-MY", { minimumFractionDigits: 2 })} — each advances to its next stage.` +
          (highValue > 0 ? ` ${highValue} high-value (≥ RM 5,000).` : "") +
          " Claims not at your stage are skipped."
        }
        confirmLabel="Approve"
        onConfirm={run}
      />
    </>
  )
}
