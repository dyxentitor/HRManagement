import { type ReactNode, useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { type BondCoverageRow, incentiveApi } from "@/modules/incentive/api"

function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-label text-text-tertiary block mb-1">
      {children}
    </label>
  )
}

interface Props {
  row: BondCoverageRow | null // employee is fixed from the coverage row
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

/** Create (row.bond == null) or edit (row.bond != null) an employee's mandays bond. */
export function BondModal({ row, open, onOpenChange, onDone }: Props) {
  const bond = row?.bond ?? null
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [termsVersion, setTermsVersion] = useState("v1")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPeriodStart(bond?.period_start ?? "")
    setPeriodEnd(bond?.period_end ?? "")
    setTermsVersion(bond?.terms_version ?? "v1")
  }, [bond])

  const termsChanged =
    bond !== null && bond.accepted_at !== null && termsVersion !== bond.terms_version

  async function save() {
    if (!row) return
    if (!periodStart || !periodEnd) {
      toast.error("Both period dates are required.")
      return
    }
    if (periodEnd <= periodStart) {
      toast.error("Period end must be after period start.")
      return
    }
    setBusy(true)
    try {
      if (bond) {
        await incentiveApi.bonds.update(bond.id, {
          period_start: periodStart,
          period_end: periodEnd,
          terms_version: termsVersion,
        })
        toast.success("Bond updated.")
      } else {
        await incentiveApi.bonds.create({
          employee_id: row.employee_id,
          period_start: periodStart,
          period_end: periodEnd,
          terms_version: termsVersion,
        })
        toast.success("Bond created.")
      }
      onOpenChange(false)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save bond.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{bond ? "Edit bond" : "Create bond"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Employee</Label>
            <p className="text-small text-text-secondary mt-1">
              {row?.employee_name}{" "}
              <span className="text-text-tertiary">({row?.employee_code})</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bond-start">Period start</Label>
              <Input
                id="bond-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bond-end">Period end</Label>
              <Input
                id="bond-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="bond-terms">Terms version</Label>
            <Input
              id="bond-terms"
              value={termsVersion}
              onChange={(e) => setTermsVersion(e.target.value)}
            />
            {termsChanged && (
              <p className="text-[11px] text-yellow mt-1">
                Changing terms requires {row?.employee_name} to re-accept the bond.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : bond ? "Save changes" : "Create bond"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
