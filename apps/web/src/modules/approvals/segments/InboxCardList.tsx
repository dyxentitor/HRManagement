import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import type { InboxItem } from "../api"
import { ClaimReviewDrawer } from "../components/ClaimReviewDrawer"
import { UnifiedApprovalCard } from "../components/UnifiedApprovalCard"
import type { SegmentProps } from "./types"

/** Shared card list for the All / Leave / KPI segments. `filterKind` narrows to
 * one type (undefined = all). `allowBulk` shows the single-type bulk-approve bar. */
export function InboxCardList({
  inbox,
  filterKind,
  emptyLabel,
}: SegmentProps & { filterKind?: InboxItem["kind"]; emptyLabel: string }) {
  const [reviewClaimId, setReviewClaimId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const items = filterKind ? inbox.items.filter((i) => i.kind === filterKind) : inbox.items
  const selectedItems = items.filter((i) => inbox.selected.has(i.id))
  const selectedKinds = new Set(selectedItems.map((i) => i.kind))
  const bulkAllowed = selectedItems.length > 0 && selectedKinds.size === 1

  async function approve(item: InboxItem, comment: string) {
    try {
      await inbox.approve(item, comment)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed")
    }
  }
  async function reject(item: InboxItem, comment: string) {
    try {
      await inbox.reject(item, comment)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed")
    }
  }
  async function bulkApprove() {
    setBulkBusy(true)
    try {
      await inbox.approveIds(selectedItems.map((i) => i.id))
    } finally {
      setBulkBusy(false)
    }
  }

  if (inbox.loading) {
    return (
      <div className="space-y-3">
        {["a", "b", "c"].map((k) => (
          <Skeleton key={k} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-coral text-small" role="alert">
          {error}
        </p>
      )}

      {selectedItems.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-accent-500/40 bg-accent-500/10 px-3 py-2">
          <span className="text-small text-accent-100">
            <b>{selectedItems.length}</b> selected
          </span>
          <Button
            type="button"
            size="sm"
            aria-label="Approve selected"
            disabled={!bulkAllowed || bulkBusy}
            onClick={bulkApprove}
            className="soft-glow"
          >
            Approve
          </Button>
          {!bulkAllowed && (
            <span className="text-[11px] text-text-tertiary">Select one type to bulk-approve</span>
          )}
          <button
            type="button"
            onClick={inbox.clearSelection}
            className="ml-auto text-small text-text-tertiary hover:text-text-primary"
          >
            Clear
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-surface-hover border border-dashed border-border-subtle rounded-xl p-8 text-center text-text-tertiary">
          {emptyLabel}
        </div>
      ) : (
        items.map((item) => (
          <UnifiedApprovalCard
            key={`${item.kind}-${item.id}`}
            item={item}
            clash={inbox.clashes.get(item.id)}
            selected={inbox.selected.has(item.id)}
            onToggleSelect={() => inbox.toggle(item.id)}
            onApprove={(c) => approve(item, c)}
            onReject={(c) => reject(item, c)}
            onReview={item.kind === "claim" ? () => setReviewClaimId(item.id) : undefined}
          />
        ))
      )}

      <ClaimReviewDrawer
        claimId={reviewClaimId}
        onClose={() => setReviewClaimId(null)}
        onActed={() => {
          setReviewClaimId(null)
          void inbox.refresh()
        }}
      />
    </div>
  )
}
