import { Check } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { toast } from "sonner"

import { DetailPanel, StatusPill } from "@/components/hrms"
import { gradientFromName } from "@/components/hrms/avatar-gradient"
import { ClampText } from "@/components/hrms/overflow"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { type InboxItem, approveItem } from "../../api"

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "")
}

function fmtDate(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
    : "—"
}

/** Minimal read-only KPI peek. Performance management is mid-rebuild, so this only
 * surfaces the inbox context and lets the manager acknowledge the review — no
 * scoring form and no reject (a manager review IS the decision). */
export function KpiReviewDrawer({
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
    if (item) setComment("")
  }, [item])

  async function approve() {
    if (!item) return
    setBusy(true)
    try {
      await approveItem("kpi", item.id, comment)
      toast.success("Review submitted")
      onActed()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    } finally {
      setBusy(false)
    }
  }

  const footer = item ? (
    <div className="flex flex-col gap-2">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add an overall comment (optional)…"
        aria-label="Review comment"
        rows={2}
        className="w-full resize-none rounded-lg bg-surface-elevated/60 border border-border-subtle px-3 py-2 text-small text-text-primary break-words"
      />
      <Button type="button" disabled={busy} onClick={approve} className="soft-glow">
        <Check className="size-4 mr-1" /> Approve review
      </Button>
    </div>
  ) : undefined

  return (
    <DetailPanel open={item !== null} onClose={onClose} title="KPI review" footer={footer}>
      {item && (
        <div className="flex flex-col gap-3">
          <Header item={item} />
          <Section title="Self-review">
            <KV label="Cycle" value={str(item.detail.cycle)} />
            <KV label="Submitted" value={fmtDate(item.submitted_at)} />
            <Field label="Employee note">
              {item.detail.reason ? (
                <ClampText text={str(item.detail.reason)} />
              ) : (
                <p className="text-small text-text-tertiary">—</p>
              )}
            </Field>
          </Section>
          <div className="rounded-2xl border border-dashed border-border-subtle px-4 py-3 text-small text-text-tertiary">
            Detailed scoring lives in the performance module, which is being rebuilt. Approving here
            records your manager review for this cycle.
          </div>
        </div>
      )}
    </DetailPanel>
  )
}

function Header({ item }: { item: InboxItem }) {
  const name = item.name || item.employee_code
  const [from, to] = gradientFromName(name)
  return (
    <div className="glass-surface rounded-2xl p-4 flex items-start gap-3">
      <div
        aria-hidden
        className={cn(
          "size-11 rounded-full bg-gradient-to-br shrink-0",
          `from-${from}`,
          `to-${to}`,
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-text-primary break-words [overflow-wrap:anywhere]">
          {name}
        </p>
        {item.department && <p className="text-small text-text-secondary">{item.department}</p>}
        <div className="mt-1">
          <StatusPill tone="sky" label="Awaiting your review" />
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
