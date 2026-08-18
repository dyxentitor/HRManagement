import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

import { type SwapCandidate, createSwapRequest, listSwapCandidates } from "../swap-api"

interface Props {
  assignmentId: string
  myDateLabel: string
  myShiftLabel: string
  onClose: () => void
  onCreated: () => void
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** Pick a teammate's shift to swap one of your own shifts with. */
export function SwapRequestDrawer({
  assignmentId,
  myDateLabel,
  myShiftLabel,
  onClose,
  onCreated,
}: Props) {
  const [candidates, setCandidates] = useState<SwapCandidate[]>([])
  const [selected, setSelected] = useState<string>("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    listSwapCandidates(assignmentId)
      .then((rows) => {
        if (!cancelled) {
          setCandidates(rows)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [assignmentId])

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await createSwapRequest({
        requesterAssignmentId: assignmentId,
        counterpartyAssignmentId: selected,
        reason,
      })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const chosen = candidates.find((c) => c.id === selected) ?? null

  return (
    <div className="bg-surface-elevated border border-border-subtle rounded-lg p-4 space-y-4">
      <div>
        <h3 className="text-h3 text-text-primary">Request a shift swap</h3>
        <p className="text-small text-text-secondary">
          Giving up {myDateLabel} · {myShiftLabel}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-coral text-small">
          {error}
        </p>
      )}

      <fieldset className="space-y-1.5 max-h-64 overflow-y-auto">
        <legend className="text-label uppercase text-text-tertiary mb-1">Swap with</legend>
        {loading && <p className="text-small text-text-tertiary">Loading teammate shifts…</p>}
        {!loading && candidates.length === 0 && (
          <p className="text-small text-text-tertiary">
            No teammate shifts available to swap with.
          </p>
        )}
        {candidates.map((c) => (
          <label
            key={c.id}
            className="flex items-center gap-2 rounded border border-border-subtle px-2 py-1.5 cursor-pointer hover:bg-surface-hover"
          >
            <input
              type="radio"
              name="swap-candidate"
              value={c.id}
              checked={selected === c.id}
              onChange={() => {
                setSelected(c.id)
                setError(null)
              }}
              aria-label={`${c.employee_name} — ${formatDate(c.work_date)} ${c.shift_name}`}
            />
            <span className="text-small text-text-primary">
              {c.employee_name} ({c.employee_code}) — {formatDate(c.work_date)} · {c.shift_name}
            </span>
          </label>
        ))}
      </fieldset>

      {chosen && (
        <p className="text-small text-text-secondary">
          After the swap you work {formatDate(chosen.work_date)} · {chosen.shift_name};{" "}
          {chosen.employee_name} works {myDateLabel} · {myShiftLabel}.
        </p>
      )}

      <div>
        <label htmlFor="swap-reason" className="block text-label uppercase text-text-tertiary mb-1">
          Reason (optional)
        </label>
        <textarea
          id="swap-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full bg-surface border border-border-subtle rounded px-2 py-1 text-text-primary text-small"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={busy || !selected}>
          Request swap
        </Button>
      </div>
    </div>
  )
}
