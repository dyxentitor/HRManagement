import { useCallback, useEffect, useState } from "react"

import { leaveApi } from "@/modules/leave/api"

import { type InboxItem, approveItem, getInbox, rejectItem } from "./api"

/** Team-coverage clash for a leave item: how many teammates are already off, and who. */
export interface Clash {
  count: number
  names: string[]
}

/** Shared approvals-inbox state + actions, used by the Approval Center and its
 * All / Leave / KPI segments (the Claims segment fetches its own richer data). */
export function useApprovalInbox() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [clashes, setClashes] = useState<Map<string, Clash>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getInbox()
      setItems(data)
      setSelected(new Set())
      // Team coverage for leave items only (claims/KPI have no calendar clash).
      const leaves = data.filter((i) => i.kind === "leave")
      const entries = await Promise.all(
        leaves.map(async (i) => {
          try {
            const cov = await leaveApi.coverage(
              String(i.detail.start_date ?? ""),
              String(i.detail.end_date ?? ""),
              i.employee_id,
            )
            const count = Object.values(cov.per_day ?? {}).reduce((a, b) => Math.max(a, b), 0)
            return [i.id, { count, names: cov.people.map((p) => p.name) }] as [string, Clash]
          } catch {
            return [i.id, { count: 0, names: [] as string[] }] as [string, Clash]
          }
        }),
      )
      setClashes(new Map(entries))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const approve = useCallback(
    async (item: InboxItem, comment: string) => {
      await approveItem(item.kind, item.id, comment)
      await refresh()
    },
    [refresh],
  )

  const reject = useCallback(
    async (item: InboxItem, comment: string) => {
      if (!comment.trim()) throw new Error("A comment is required to reject.")
      await rejectItem(item.kind, item.id, comment)
      await refresh()
    },
    [refresh],
  )

  const approveIds = useCallback(
    async (ids: string[]) => {
      for (const id of ids) {
        const it = items.find((i) => i.id === id)
        if (it) await approveItem(it.kind, it.id, "")
      }
      await refresh()
    },
    [items, refresh],
  )

  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  /** Add every id in ``ids`` to the selection, keeping anything already picked. */
  const selectMany = useCallback((ids: string[]) => {
    setSelected((s) => new Set([...s, ...ids]))
  }, [])

  /** Drop every id in ``ids`` from the selection, leaving the rest untouched. */
  const deselectMany = useCallback((ids: string[]) => {
    setSelected((s) => {
      const drop = new Set(ids)
      return new Set([...s].filter((id) => !drop.has(id)))
    })
  }, [])

  return {
    items,
    clashes,
    selected,
    loading,
    error,
    refresh,
    approve,
    reject,
    approveIds,
    toggle,
    clearSelection,
    selectMany,
    deselectMany,
  }
}

export type UseApprovalInbox = ReturnType<typeof useApprovalInbox>
