import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { StatusPill } from "@/components/hrms"

import { type SwapRequest, cancelSwapRequest, listMySwapRequests } from "../swap-api"

const TONE: Record<SwapRequest["status"], "yellow" | "mint" | "coral" | "sky"> = {
  pending: "yellow",
  approved: "mint",
  rejected: "coral",
  cancelled: "sky",
}

function slot(a: SwapRequest["requester_assignment"]): string {
  const d = new Date(`${a.work_date}T00:00:00Z`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
  return `${d} · ${a.shift_name}`
}

export function MySwapRequests({
  refreshKey,
  onChanged,
}: {
  refreshKey: number
  onChanged: () => void
}) {
  const [rows, setRows] = useState<SwapRequest[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(() => {
    listMySwapRequests()
      .then((data) => {
        setRows(data)
        setLoadError(null)
      })
      .catch((e: unknown) => {
        console.error("Failed to load swap requests", e)
        setLoadError("Couldn't load your swap requests.")
      })
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a counter prop that intentionally triggers a re-fetch
  useEffect(() => {
    load()
  }, [load, refreshKey])

  async function cancel(id: string) {
    setBusy(id)
    try {
      await cancelSwapRequest(id)
      onChanged()
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (loadError !== null) {
    return (
      <p role="alert" className="text-small text-text-secondary">
        {loadError}
      </p>
    )
  }

  if (rows.length === 0) return null

  return (
    <section className="glass-surface rounded-2xl p-4">
      <h2 className="text-label uppercase text-text-tertiary mb-2">My swap requests</h2>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-2 text-small text-text-secondary py-1.5 border-b border-border-subtle last:border-0"
          >
            <StatusPill tone={TONE[r.status]} label={r.status} />
            <span className="text-text-primary">
              {slot(r.requester_assignment)} → {slot(r.counterparty_assignment)}
            </span>
            <span>with {r.counterparty_name}</span>
            {r.status === "pending" && (
              <button
                type="button"
                onClick={() => cancel(r.id)}
                disabled={busy === r.id}
                className="ml-auto text-coral hover:text-coral/80 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
