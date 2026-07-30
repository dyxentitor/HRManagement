import { Check, X } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { toast } from "sonner"

import { DetailPanel, StatusPill } from "@/components/hrms"
import { gradientFromName } from "@/components/hrms/avatar-gradient"
import { ClampText } from "@/components/hrms/overflow"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { type InboxItem, approveItem, rejectItem } from "../../api"
import { friendlyActionError } from "../../lib/action-errors"

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "")
}

/** Review drawer for a mandays (incentive) claim in the unified inbox. */
export function IncentiveReviewDrawer({
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

  useEffect(() => {
    setComment("")
  }, [])

  async function act(kind: "approve" | "reject") {
    if (!item) return
    if (kind === "reject" && !comment.trim()) {
      toast.error("A reason is required to reject")
      return
    }
    setBusy(true)
    try {
      if (kind === "approve") await approveItem("incentive", item.id, comment)
      else await rejectItem("incentive", item.id, comment)
      toast.success(kind === "approve" ? "Claim approved" : "Claim rejected")
      onActed()
    } catch (e) {
      toast.error(friendlyActionError(e))
    } finally {
      setBusy(false)
    }
  }

  const footer = item ? (
    <div className="flex flex-col gap-2">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a reason (required to reject)…"
        aria-label="Review reason"
        rows={2}
        className="w-full resize-none rounded-lg bg-surface-elevated/60 border border-border-subtle px-3 py-2 text-small text-text-primary break-words"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => act("reject")}
          className="flex-1 text-coral border-coral/40"
        >
          <X className="size-4 mr-1" /> Reject
        </Button>
        <Button type="button" disabled={busy} onClick={() => act("approve")} className="flex-1 soft-glow">
          <Check className="size-4 mr-1" /> Approve
        </Button>
      </div>
    </div>
  ) : undefined

  return (
    <DetailPanel open={item !== null} onClose={onClose} title="Mandays review" footer={footer}>
      {item && (
        <div className="flex flex-col gap-3">
          <Header item={item} />
          <Section title="Claim">
            <KV label="Project" value={str(item.detail.project)} />
            <KV label="Customer" value={str(item.detail.customer)} />
            <KV label="Mandays" value={`${str(item.detail.mandays)} md`} />
            <Field label="Note">
              {item.detail.note ? (
                <ClampText text={str(item.detail.note)} />
              ) : (
                <p className="text-small text-text-tertiary">—</p>
              )}
            </Field>
          </Section>
        </div>
      )}
    </DetailPanel>
  )
}

function Header({ item }: { item: InboxItem }) {
  const name = item.name || item.employee_code
  const [from, to] = gradientFromName(name)
  return (
    <div className="glass-surface rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-text-tertiary">Claimed</p>
          <p className="text-[26px] leading-tight font-light tabular-nums text-text-primary">
            {str(item.detail.mandays)} md
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <StatusPill tone="sky" label="Pending approval" />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-border-subtle flex items-start gap-3">
        <div
          aria-hidden
          className={cn("size-11 rounded-full bg-gradient-to-br shrink-0", `from-${from}`, `to-${to}`)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-text-primary break-words [overflow-wrap:anywhere]">
            {name}
          </p>
          {item.department && <p className="text-small text-text-secondary">{item.department}</p>}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass-surface rounded-2xl px-4 py-3">
      <p className="layer-eyebrow mb-2">／ {title}</p>
      {children}
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border-subtle/60 last:border-b-0">
      <span className="text-small text-text-tertiary shrink-0">{label}</span>
      <span className="min-w-0 text-right text-small text-text-primary">{value || "—"}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pt-2.5">
      <p className="text-[11px] text-text-tertiary mb-0.5">{label}</p>
      {children}
    </div>
  )
}
