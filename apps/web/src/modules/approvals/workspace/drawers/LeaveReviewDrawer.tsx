import { Check, X } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { toast } from "sonner"

import { DetailPanel, StatusPill } from "@/components/hrms"
import { gradientFromName } from "@/components/hrms/avatar-gradient"
import { ClampText } from "@/components/hrms/overflow"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type Coverage, type LeaveBalance, leaveApi } from "@/modules/leave/api"
import { formatRange } from "@/modules/leave/lib/leave-dates"

import { type InboxItem, approveItem, rejectItem } from "../../api"

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "")
}

export function LeaveReviewDrawer({
  item,
  onClose,
  onActed,
}: {
  item: InboxItem | null
  onClose: () => void
  onActed: () => void
}) {
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)

  const start = str(item?.detail.start_date)
  const end = str(item?.detail.end_date)

  useEffect(() => {
    if (!item) return
    setComment("")
    setCoverage(null)
    setBalance(null)
    leaveApi
      .coverage(start, end, item.employee_id)
      .then(setCoverage)
      .catch(() => setCoverage(null))
    leaveApi
      .balancesFor(item.employee_id)
      .then((rows) => setBalance(rows.find((b) => b.leave_type_code === item.type_code) ?? null))
      .catch(() => setBalance(null))
  }, [item, start, end])

  async function act(kind: "approve" | "reject") {
    if (!item) return
    if (kind === "reject" && !comment.trim()) {
      toast.error("A comment is required to reject")
      return
    }
    setBusy(true)
    try {
      if (kind === "approve") await approveItem("leave", item.id, comment)
      else await rejectItem("leave", item.id, comment)
      toast.success(kind === "approve" ? "Leave approved" : "Leave rejected")
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
        placeholder="Add a comment (required to reject)…"
        aria-label="Approval comment"
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
        <Button
          type="button"
          disabled={busy}
          onClick={() => act("approve")}
          className="flex-1 soft-glow"
        >
          <Check className="size-4 mr-1" /> Approve
        </Button>
      </div>
    </div>
  ) : undefined

  return (
    <DetailPanel open={item !== null} onClose={onClose} title="Leave review" footer={footer}>
      {item && (
        <div className="flex flex-col gap-3">
          <Header item={item} />
          <Section title="Request">
            <KV label="Leave type" value={item.type_code} />
            <KV label="Dates" value={formatRange(start, end)} />
            <KV label="Duration" value={`${str(item.detail.total_days)} days`} />
            {item.detail.is_half_day ? <KV label="Half day" value="Yes" /> : null}
            <Field label="Reason">
              {item.detail.reason ? (
                <ClampText text={str(item.detail.reason)} />
              ) : (
                <p className="text-small text-text-tertiary">—</p>
              )}
            </Field>
          </Section>

          <Section title="Team coverage">
            {coverage === null ? (
              <p className="text-small text-text-tertiary">Coverage unavailable.</p>
            ) : coverage.people.length === 0 ? (
              <p className="text-small text-mint">No teammates are off during these dates ✓</p>
            ) : (
              <ul className="space-y-1.5">
                {coverage.people.map((p) => (
                  <li
                    key={`${p.employee_id}-${p.start}`}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="min-w-0 truncate text-small text-text-primary">{p.name}</span>
                    <span className="shrink-0 text-[11px] text-text-tertiary">
                      {formatRange(p.start, p.end)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Balance impact">
            {balance === null ? (
              <p className="text-small text-text-tertiary">Balance unavailable.</p>
            ) : (
              <>
                <KV label="Available" value={`${balance.available} days`} />
                <KV label="Already pending" value={`${balance.pending} days`} />
                <KV label="Entitled" value={`${balance.entitled} days`} />
              </>
            )}
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
          <p className="text-[11px] text-text-tertiary">Requested</p>
          <p className="text-[26px] leading-tight font-light tabular-nums text-text-primary">
            {str(item.detail.total_days)} days
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <StatusPill tone="sky" label="Pending approval" />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-border-subtle flex items-start gap-3">
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
