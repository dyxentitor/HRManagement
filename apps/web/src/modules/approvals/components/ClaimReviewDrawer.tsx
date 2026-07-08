import { Check, FileText, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { DetailPanel, StatusPill } from "@/components/hrms"
import { gradientFromName } from "@/components/hrms/avatar-gradient"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCan } from "@/lib/perm"
import { cn } from "@/lib/utils"
import { listAuditLogs } from "@/modules/admin/audit-api"
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
      toast.error(e instanceof Error ? e.message : "Action failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailPanel open={claimId !== null} onClose={onClose} title="Claim review">
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
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
        <div className="flex flex-col gap-4 pb-24">
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

          <div className="fixed bottom-0 right-0 w-full max-w-[var(--panel-w,32rem)] border-t border-border-subtle bg-surface/95 backdrop-blur px-5 py-3 flex items-end gap-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment (required to reject)…"
              aria-label="Approval comment"
              className="flex-1 min-h-9 max-h-24 rounded-lg bg-surface-elevated/60 border border-border-subtle px-3 py-2 text-small text-text-primary"
              rows={1}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => act("reject")}
              className="text-coral border-coral/40"
            >
              <X className="size-4 mr-1" /> Reject
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => act("approve")}
              className="soft-glow"
            >
              <Check className="size-4 mr-1" /> Approve
            </Button>
          </div>
        </div>
      )}
    </DetailPanel>
  )
}

function Header({ claim }: { claim: ClaimRequest }) {
  const [from, to] = gradientFromName(claim.employee_name || claim.employee_code || "?")
  const status = (claim.status ?? "submitted") as ClaimStatus
  return (
    <div className="glass-surface rounded-2xl p-4 flex items-start gap-3">
      <div
        aria-hidden
        className={cn(
          "size-12 rounded-full bg-gradient-to-br shrink-0",
          `from-${from}`,
          `to-${to}`,
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-h3 text-text-primary truncate">{claim.employee_name || "—"}</p>
        <p className="text-small text-text-secondary truncate">
          {[claim.employee_department_name, claim.employee_role_title]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
        <p className="text-[11px] text-text-tertiary truncate">
          {claim.employee_manager_name ? `Manager: ${claim.employee_manager_name}` : "No manager"}
          {claim.employee_code ? ` · ${claim.employee_code}` : ""}
        </p>
      </div>
      <div className="text-right shrink-0">
        <div className="text-h3 text-text-primary tabular-nums">
          {claim.currency_code} {claim.amount}
        </div>
        <div className="mt-1 flex justify-end">
          <StatusPill tone={STATUS_TONE[status]} label={STATUS_LABEL[status]} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-border-subtle last:border-b-0">
      <span className="text-small text-text-tertiary shrink-0">{label}</span>
      <span className="text-small text-text-primary text-right">{value || "—"}</span>
    </div>
  )
}

function Summary({ claim }: { claim: ClaimRequest }) {
  return (
    <Section title="Claim summary">
      <Row label="Category" value={claim.category_name || claim.category_code} />
      <Row label="Expense date" value={fmtDate(claim.expense_date)} />
      <Row label="Merchant" value={claim.merchant} />
      <Row label="Submitted" value={fmtDate(claim.submitted_at)} />
      <div className="pt-2">
        <p className="text-small text-text-tertiary">Description</p>
        <p className="text-small text-text-primary mt-0.5 whitespace-pre-wrap">
          {claim.description || "—"}
        </p>
      </div>
      <div className="pt-2">
        <p className="text-small text-text-tertiary">Business justification</p>
        <p className="text-small text-text-primary mt-0.5 whitespace-pre-wrap">
          {claim.business_justification || "—"}
        </p>
      </div>
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
                  "size-6 rounded-full grid place-items-center text-[10px] mt-0.5",
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
            <div className="pb-4 min-w-0">
              <p className="text-small text-text-primary">
                {a.approver_name || "Pending approver"}{" "}
                <span className="text-text-tertiary">· {a.status}</span>
              </p>
              {a.comment && <p className="text-[11px] text-text-secondary">“{a.comment}”</p>}
              <p className="text-[10px] text-text-tertiary">
                {a.acted_at ? fmtDate(a.acted_at) : "awaiting"}
              </p>
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
          <Row label="Claim ID" value={claim.id} />
          <Row label="Created" value={fmtDate(claim.created_at)} />
          <Row label="Updated" value={fmtDate(claim.updated_at)} />
          {claim.reimbursement_reference ? (
            <Row label="Reimbursement ref" value={claim.reimbursement_reference} />
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
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-[11px]">
              <FileText className="size-3.5 text-text-tertiary shrink-0" />
              <span className="text-text-primary">{r.action}</span>
              <span className="text-text-tertiary">· {r.actor}</span>
              <span className="ml-auto text-text-tertiary">{fmtDate(r.ts)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-surface rounded-2xl px-4 py-3">
      <p className="layer-eyebrow mb-2">／ {title}</p>
      {children}
    </div>
  )
}
