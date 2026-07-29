import {
  AlertTriangle,
  CalendarDays,
  CalendarX2,
  Clock,
  FileSignature,
  ShieldCheck,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import type { MeEligibility } from "../api"

interface Props {
  eligibility: MeEligibility
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Performs the actual acceptance (API call + toasts). Resolves when done. */
  onConfirm: () => Promise<void>
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

function durationMonths(start: string | null, end: string | null): string {
  if (!start || !end) return "—"
  const a = new Date(`${start}T00:00:00Z`)
  const b = new Date(`${end}T00:00:00Z`)
  const months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000)
  if (months < 1) return `${days} days`
  return `≈ ${months} month${months === 1 ? "" : "s"}`
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-elevated/40 px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-500/15 text-accent-200">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-text-tertiary">{label}</p>
        <p className="text-small font-medium text-text-primary">{value}</p>
      </div>
    </div>
  )
}

/** Premium two-step confirmation before an employee accepts their mandays bond. */
export function BondAcceptModal({ eligibility, open, onOpenChange, onConfirm }: Props) {
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)

  // Fresh consent every time the dialog opens.
  useEffect(() => {
    if (open) setAgreed(false)
  }, [open])

  async function confirm() {
    if (!agreed || busy) return
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // Error already surfaced by the caller's toast — keep the dialog open.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-500/20 text-accent-200 soft-glow">
              <FileSignature className="size-5" aria-hidden />
            </span>
            <div>
              <DialogTitle>Mandays Incentive Bond</DialogTitle>
              <DialogDescription>
                Terms {eligibility.terms_version ?? "v1"} · please review before accepting
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <DetailRow
            icon={<Clock className="size-4" />}
            label="Duration"
            value={durationMonths(eligibility.period_start, eligibility.period_end)}
          />
          <DetailRow
            icon={<CalendarDays className="size-4" />}
            label="Starts"
            value={fmtDate(eligibility.period_start)}
          />
          <DetailRow
            icon={<CalendarX2 className="size-4" />}
            label="Ends"
            value={fmtDate(eligibility.period_end)}
          />
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-elevated/30 p-4 space-y-3 max-h-56 overflow-y-auto">
          <div>
            <h4 className="flex items-center gap-1.5 text-small font-semibold text-text-primary">
              <ShieldCheck className="size-4 text-mint" aria-hidden /> What this bond grants
            </h4>
            <p className="text-small text-text-secondary mt-1">
              An accepted bond makes you eligible to log mandays claims on approved projects and
              receive incentive payouts at the prevailing rate for the duration of the bond period.
            </p>
          </div>
          <div>
            <h4 className="text-small font-semibold text-text-primary">Your obligations</h4>
            <ul className="text-small text-text-secondary mt-1 list-disc pl-5 space-y-0.5">
              <li>Log claims only for mandays you genuinely worked on the named project.</li>
              <li>Claims remain subject to manager approval and the project's budget.</li>
              <li>Keep your work records accurate — approved claims feed the payout ledger.</li>
            </ul>
          </div>
          <div>
            <h4 className="flex items-center gap-1.5 text-small font-semibold text-text-primary">
              <AlertTriangle className="size-4 text-yellow" aria-hidden /> Early termination &
              expiry
            </h4>
            <p className="text-small text-text-secondary mt-1">
              If the bond is revoked or expires, your claim eligibility ends immediately: pending
              claims may be rejected and no new claims can be logged. Payouts already approved are
              handled per company policy. HR may update the terms, in which case you will be asked
              to accept the new version.
            </p>
          </div>
          <p className="text-[11px] text-text-tertiary border-t border-border-subtle pt-2">
            By accepting, you acknowledge that you have read, understood, and agree to the terms and
            conditions of this bond. Your acceptance is recorded with a timestamp in the audit log.
          </p>
        </div>

        <label className="flex items-start gap-2.5 rounded-lg border border-border-subtle px-3 py-2.5 cursor-pointer select-none hover:bg-surface-elevated/40 transition-colors">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            aria-label="I have read and agree to the bond terms"
            className="mt-0.5"
          />
          <span className="text-small text-text-secondary">
            I have read and agree to the bond terms
          </span>
        </label>

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!agreed || busy}
            onClick={() => void confirm()}
            className="soft-glow bg-accent-500 text-white"
          >
            <ShieldCheck className="size-4 mr-1" aria-hidden />
            {busy ? "Accepting…" : "Accept Bond"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
