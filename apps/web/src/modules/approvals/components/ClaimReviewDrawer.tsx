import { Check, FileText, X } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { DetailPanel, StatusPill } from "@/components/hrms"
import { gradientFromName } from "@/components/hrms/avatar-gradient"
import { ClampText, TruncTip } from "@/components/hrms/overflow"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useCan } from "@/lib/perm"
import { cn } from "@/lib/utils"
import { listAuditLogs } from "@/modules/admin/audit-api"
import { friendlyActionError } from "@/modules/approvals/lib/action-errors"
import { type ClaimRequest, type ClaimStatus, claimsApi } from "@/modules/claims/api"
import { ClaimReceipts } from "@/modules/claims/components/ClaimReceipts"

const STATUS_TONE: Record<ClaimStatus, "mint" | "yellow" | "coral" | "sky" | "lavender" | "peach"> =
  {
    draft: "peach",
    submitted: "sky",
    manager_approved: "lavender",
    finance_approved: "mint",
    reimbursed: "mint",
    rejected: "coral",
    cancelled: "peach",
  }

const STATUS_LABEL: Record<ClaimStatus, string> = {
  draft: "Draft",
  submitted: "Pending approval",
  manager_approved: "Manager approved",
  finance_approved: "Finance approved",
  reimbursed: "Reimbursed",
  rejected: "Rejected",
  cancelled: "Cancelled",
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function fmtMoney(amount: string, currency: string): string {
  const n = Number(amount)
  const formatted = Number.isFinite(n)
    ? n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : amount
  return `${currency} ${formatted}`
}

function claimRef(id: string): string {
  return `CLM-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`
}

// --- drawer -------------------------------------------------------------------

export interface ClaimReviewDrawerProps {
  claimId: string | null
  onClose: () => void
  onActed: () => void
}

export function ClaimReviewDrawer({ claimId, onClose, onActed }: ClaimReviewDrawerProps) {
  const canAudit = useCan("audit:read:org")
  const [claim, setClaim] = useState<ClaimRequest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    setError(false)
    try {
      setClaim(await claimsApi.retrieve(id))
    } catch {
      setError(true)
      setClaim(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (claimId) {
      setComment("")
      void load(claimId)
    }
  }, [claimId, load])

  async function act(kind: "approve" | "reject") {
    if (!claim) return
    if (kind === "reject" && !comment.trim()) {
      toast.error("A comment is required to reject")
      return
    }
    setBusy(true)
    try {
      if (kind === "approve") await claimsApi.approve(claim.id, comment)
      else await claimsApi.reject(claim.id, comment)
      toast.success(kind === "approve" ? "Claim approved" : "Claim rejected")
      onActed()
    } catch (e) {
      toast.error(friendlyActionError(e))
    } finally {
      setBusy(false)
    }
  }

  const footer = claim ? (
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
    <DetailPanel open={claimId !== null} onClose={onClose} title="Claim review" footer={footer}>
      <TooltipProvider delayDuration={200}>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : error || !claim ? (
          <div className="text-center py-10">
            <p className="text-text-secondary">Couldn't load the claim.</p>
            {claimId && (
              <Button type="button" className="mt-3" onClick={() => load(claimId)}>
                Retry
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Header claim={claim} />
            <Summary claim={claim} />
            <Section
              title={`Receipts${claim.attachments.length ? ` (${claim.attachments.length})` : ""}`}
            >
              <ClaimReceipts claimId={claim.id} attachments={claim.attachments} />
            </Section>
            <Section title="Approval timeline">
              <Timeline claim={claim} />
            </Section>
            <Metadata claim={claim} />
            {canAudit && <AuditTrail claimId={claim.id} />}
          </div>
        )}
      </TooltipProvider>
    </DetailPanel>
  )
}

function Header({ claim }: { claim: ClaimRequest }) {
  const [from, to] = gradientFromName(claim.employee_name || claim.employee_code || "?")
  const status = (claim.status ?? "submitted") as ClaimStatus
  const deptRole = [claim.employee_department_name, claim.employee_role_title]
    .filter(Boolean)
    .join(" · ")
  return (
    <div className="glass-surface rounded-2xl p-4">
      {/* Amount is the hero decision datum. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-text-tertiary">Claim amount</p>
          <p className="text-[26px] leading-tight font-light tabular-nums text-text-primary break-words">
            {fmtMoney(claim.amount, claim.currency_code)}
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <StatusPill tone={STATUS_TONE[status]} label={STATUS_LABEL[status]} />
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
            {claim.employee_name || "—"}
          </p>
          {deptRole && (
            <p className="text-small text-text-secondary break-words [overflow-wrap:anywhere]">
              {deptRole}
            </p>
          )}
          <p className="text-[11px] text-text-tertiary mt-0.5">
            {claimRef(claim.id)} · Submitted {fmtDate(claim.submitted_at)}
          </p>
        </div>
      </div>
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border-subtle/60 last:border-b-0">
      <span className="text-small text-text-tertiary shrink-0">{label}</span>
      <span className="min-w-0 text-right text-small text-text-primary">
        <TruncTip text={value || "—"} />
      </span>
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

function Summary({ claim }: { claim: ClaimRequest }) {
  return (
    <Section title="Claim summary">
      <KV label="Category" value={claim.category_name || claim.category_code} />
      <KV label="Expense date" value={fmtDate(claim.expense_date)} />
      {claim.employee_manager_name ? (
        <KV label="Reporting manager" value={claim.employee_manager_name} />
      ) : null}
      <Field label="Merchant">
        <p className="text-small text-text-primary break-words [overflow-wrap:anywhere]">
          {claim.merchant || "—"}
        </p>
      </Field>
      <Field label="Description">
        {claim.description ? (
          <ClampText text={claim.description} />
        ) : (
          <p className="text-small text-text-tertiary">—</p>
        )}
      </Field>
      <Field label="Business justification">
        {claim.business_justification ? (
          <ClampText text={claim.business_justification} />
        ) : (
          <p className="text-small text-text-tertiary">—</p>
        )}
      </Field>
    </Section>
  )
}

function Timeline({ claim }: { claim: ClaimRequest }) {
  const rows = [...(claim.approvals ?? [])].sort((a, b) => a.level - b.level)
  if (rows.length === 0)
    return <p className="text-small text-text-tertiary">No approvals recorded yet.</p>
  return (
    <ol className="space-y-0">
      {rows.map((a, i) => {
        const done = a.status === "approved"
        const rejected = a.status === "rejected"
        return (
          <li key={a.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "size-6 rounded-full grid place-items-center text-[10px] mt-0.5 shrink-0",
                  done && "bg-mint/20 text-mint",
                  rejected && "bg-coral/20 text-coral",
                  !done && !rejected && "bg-sky/20 text-sky",
                )}
              >
                {done ? (
                  <Check className="size-3.5" />
                ) : rejected ? (
                  <X className="size-3.5" />
                ) : (
                  a.level
                )}
              </span>
              {i < rows.length - 1 && <span className="w-px flex-1 bg-border-subtle my-1" />}
            </div>
            <div className="pb-4 min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-small text-text-primary">
                  <TruncTip text={a.approver_name || "Pending approver"} />
                </span>
                <span className="shrink-0 text-[10px] text-text-tertiary">
                  {a.acted_at ? fmtDate(a.acted_at) : "awaiting"}
                </span>
              </div>
              <p className="text-[10px] text-text-tertiary capitalize">{a.status}</p>
              {a.comment && (
                <p className="text-[11px] text-text-secondary mt-0.5 break-words [overflow-wrap:anywhere]">
                  “{a.comment}”
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Metadata({ claim }: { claim: ClaimRequest }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass-surface rounded-2xl px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-small text-text-secondary"
      >
        Metadata
        <span className="text-text-tertiary">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-2">
          <Field label="Claim ID">
            <p className="text-[11px] text-text-secondary break-all font-mono">{claim.id}</p>
          </Field>
          <KV label="Created" value={fmtDate(claim.created_at)} />
          <KV label="Updated" value={fmtDate(claim.updated_at)} />
          {claim.reimbursement_reference ? (
            <KV label="Reimbursement ref" value={claim.reimbursement_reference} />
          ) : null}
        </div>
      )}
    </div>
  )
}

function AuditTrail({ claimId }: { claimId: string }) {
  const [rows, setRows] = useState<
    { id: number; action: string; actor: string; ts: string }[] | null
  >(null)
  useEffect(() => {
    listAuditLogs({ entity: "claim_request", entity_id: claimId } as never)
      .then((p) => setRows((p.results ?? []) as never))
      .catch(() => setRows([]))
  }, [claimId])
  return (
    <Section title="Audit trail">
      {rows === null ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="text-small text-text-tertiary">No audit entries.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-baseline gap-2 text-[11px]">
              <FileText className="size-3.5 text-text-tertiary shrink-0 self-center" aria-hidden />
              <span className="min-w-0 flex-1">
                <TruncTip text={`${r.action} · ${r.actor}`} className="text-text-primary" />
              </span>
              <span className="shrink-0 text-text-tertiary">{fmtDate(r.ts)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
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
