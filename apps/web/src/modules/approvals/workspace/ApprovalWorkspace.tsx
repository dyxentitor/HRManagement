import type { FC } from "react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"

import { type InboxItem, approveItem } from "../api"
import { friendlyActionError } from "../lib/action-errors"
import { matchesInboxSearch } from "../lib/inbox-filter"
import type { Clash, UseApprovalInbox } from "../useApprovalInbox"
import { ApprovalRow, type ApprovalRowItem } from "./ApprovalRow"
import { type ToolbarLens, WorkspaceToolbar } from "./WorkspaceToolbar"
import type { LensTone } from "./WorkspaceToolbar"

/** Inbox rows lack decision flags; queue rows (Leave history) carry them. */
export type WorkspaceRow = ApprovalRowItem
export type WorkspaceCtx = { clashes: Map<string, Clash> }

export interface WorkspaceLens {
  key: string
  label: string
  icon: ToolbarLens["icon"]
  tone: LensTone
  predicate: (item: WorkspaceRow, ctx: WorkspaceCtx) => boolean
}

export interface WorkspaceSort {
  key: string
  label: string
  make: (ctx: WorkspaceCtx) => (a: WorkspaceRow, b: WorkspaceRow) => number
}

/** Queue mode: the page self-fetches tabbed history from a backend approvals
 * endpoint instead of reading the shared pending inbox (how Claims already works). */
export interface WorkspaceQueue {
  tabs: { key: string; label: string }[]
  fetchTab: (tab: string) => Promise<WorkspaceRow[]>
  fetchSummary: () => Promise<Record<string, number>>
  lensCount: (summary: Record<string, number>, lensKey: string) => number
}

export interface WorkspaceDescriptor {
  emptyLabel: string
  lenses: WorkspaceLens[]
  sorts: WorkspaceSort[]
  typeFilter?: boolean
  queue?: WorkspaceQueue
  DetailDrawer: FC<{ item: InboxItem | null; onClose: () => void; onActed: () => void }>
}

const TYPE_OPTS = [
  { value: "all", label: "All" },
  { value: "claim", label: "Claims" },
  { value: "leave", label: "Leave" },
  { value: "kpi", label: "KPI" },
  { value: "incentive", label: "Mandays" },
]

export function ApprovalWorkspace({
  inbox,
  filterKind,
  descriptor,
}: {
  inbox?: UseApprovalInbox
  filterKind?: InboxItem["kind"]
  descriptor: WorkspaceDescriptor
}) {
  const queue = descriptor.queue
  const [search, setSearch] = useState("")
  const [activeLens, setActiveLens] = useState<string | null>(null)
  const [sort, setSort] = useState(descriptor.sorts[0]?.key ?? "urgency")
  const [type, setType] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [openId, setOpenId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [tab, setTab] = useState(queue?.tabs[0]?.key ?? "awaiting")

  // Queue-mode state (unused in inbox mode).
  const [qRows, setQRows] = useState<WorkspaceRow[]>([])
  const [qSummary, setQSummary] = useState<Record<string, number>>({})
  const [qLoading, setQLoading] = useState(false)
  const [qSel, setQSel] = useState<Set<string>>(new Set())

  const refetch = useCallback(async () => {
    if (!queue) return
    setQLoading(true)
    try {
      const [rows, sum] = await Promise.all([queue.fetchTab(tab), queue.fetchSummary()])
      setQRows(rows)
      setQSummary(sum)
      setQSel(new Set())
    } catch {
      setQRows([])
    } finally {
      setQLoading(false)
    }
  }, [queue, tab])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const clashes = inbox?.clashes ?? new Map<string, Clash>()
  const ctx: WorkspaceCtx = { clashes }

  // Unified data + actions across the two modes.
  const allItems: WorkspaceRow[] = queue ? qRows : (inbox?.items ?? [])
  const loading = queue ? qLoading : (inbox?.loading ?? false)
  const selected = queue ? qSel : (inbox?.selected ?? new Set<string>())

  function toggleSel(id: string) {
    if (queue) {
      setQSel((s) => {
        const next = new Set(s)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else inbox?.toggle(id)
  }
  const clearSel = queue ? () => setQSel(new Set()) : () => inbox?.clearSelection()

  function setManySel(ids: string[], picked: boolean) {
    if (queue) {
      setQSel((s) => {
        const next = new Set(s)
        for (const id of ids) {
          if (picked) next.add(id)
          else next.delete(id)
        }
        return next
      })
    } else if (picked) inbox?.selectMany(ids)
    else inbox?.deselectMany(ids)
  }

  async function approveOne(item: WorkspaceRow) {
    if (actingId) return // one action in flight at a time
    setActingId(item.id)
    try {
      if (queue) {
        await approveItem(item.kind, item.id, "")
        await refetch()
      } else if (inbox) {
        await inbox.approve(item, "")
      }
      toast.success("Approved")
    } catch (e) {
      // Stale row (already actioned / moved stage): friendly message + refresh.
      toast.error(friendlyActionError(e))
      if (queue) await refetch()
      else inbox?.refresh()
    } finally {
      setActingId(null)
    }
  }
  async function approveMany(ids: string[]) {
    if (queue) {
      for (const id of ids) await approveItem("leave", id, "")
      await refetch()
    } else if (inbox) {
      await inbox.approveIds(ids)
    }
  }

  // Base scope: queue rows are pre-scoped; inbox uses kind / type filters.
  const kindScoped = queue
    ? allItems
    : filterKind
      ? allItems.filter((i) => i.kind === filterKind)
      : allItems
  const base =
    !queue && !filterKind && type !== "all" ? kindScoped.filter((i) => i.kind === type) : kindScoped

  const lenses: ToolbarLens[] = descriptor.lenses.map((l) => ({
    key: l.key,
    label: l.label,
    icon: l.icon,
    tone: l.tone,
    count: queue
      ? queue.lensCount(qSummary, l.key)
      : base.filter((i) => l.predicate(i, ctx)).length,
  }))

  const lens = descriptor.lenses.find((l) => l.key === activeLens)
  const cmp = (descriptor.sorts.find((s) => s.key === sort) ?? descriptor.sorts[0])?.make(ctx)
  const searched = base
    .filter((i) => matchesInboxSearch(i, search))
    .filter((i) => (lens ? lens.predicate(i, ctx) : true))
  const filtered = cmp ? [...searched].sort(cmp) : searched

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const selectedItems = base.filter((i) => selected.has(i.id))
  const singleKind = new Set(selectedItems.map((i) => i.kind)).size === 1
  const bulkAllowed = selectedItems.length > 0 && singleKind

  // "Select all" spans every row matching the CURRENT filters (not just this
  // page) — selection is already keyed by id and survives paging. History rows
  // in the queue tabs carry actionable=false and are skipped, so a select-all
  // can never load the bulk bar with rows that cannot be approved.
  const selectableRows = filtered.filter((i) => i.actionable ?? true)
  const selectableIds = selectableRows.map((i) => i.id)
  const selectedVisible = selectableIds.filter((id) => selected.has(id)).length
  const allVisibleSelected = selectableIds.length > 0 && selectedVisible === selectableIds.length
  const someVisibleSelected = selectedVisible > 0 && !allVisibleSelected

  const awaitingCount = queue ? (qSummary.awaiting_count ?? base.length) : base.length
  const openItem = openId ? (allItems.find((i) => i.id === openId) ?? null) : null
  const Drawer = descriptor.DetailDrawer
  const variant = queue || filterKind ? "typed" : "all"

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-3 pb-16">
        <WorkspaceToolbar
          awaiting={awaitingCount}
          search={search}
          onSearch={(s) => {
            setSearch(s)
            setPage(1)
          }}
          lenses={lenses}
          activeLens={activeLens}
          onLens={(k) => {
            setActiveLens(k)
            setPage(1)
          }}
          sorts={descriptor.sorts}
          sort={sort}
          onSort={setSort}
          tabs={
            queue
              ? {
                  items: queue.tabs,
                  value: tab,
                  onChange: (t) => {
                    setTab(t)
                    setPage(1)
                  },
                }
              : undefined
          }
          typeFilter={
            !queue && !filterKind && descriptor.typeFilter
              ? {
                  value: type,
                  options: TYPE_OPTS,
                  onChange: (v) => {
                    setType(v)
                    setPage(1)
                    clearSel()
                  },
                }
              : undefined
          }
        />

        {loading ? (
          <div className="space-y-2">
            {["a", "b", "c", "d"].map((k) => (
              <Skeleton key={k} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-surface-hover border border-dashed border-border-subtle rounded-xl p-10 text-center text-text-tertiary">
            {base.length === 0 ? descriptor.emptyLabel : "Nothing matches your filters."}
          </div>
        ) : (
          <>
            {selectableIds.length > 0 && (
              <div className="flex items-center gap-2.5 px-3">
                <input
                  type="checkbox"
                  className="shrink-0"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    // Indeterminate is DOM-only — React has no prop for it.
                    if (el) el.indeterminate = someVisibleSelected
                  }}
                  onChange={(e) => setManySel(selectableIds, e.target.checked)}
                  aria-label={
                    allVisibleSelected
                      ? `Deselect all ${selectableIds.length}`
                      : `Select all ${selectableIds.length}`
                  }
                />
                <button
                  type="button"
                  onClick={() => setManySel(selectableIds, !allVisibleSelected)}
                  className="text-[11px] text-text-tertiary hover:text-text-primary"
                >
                  {allVisibleSelected
                    ? `Deselect all ${selectableIds.length}`
                    : `Select all ${selectableIds.length}`}
                </button>
                {selectedVisible > 0 && (
                  <span className="text-[11px] text-text-tertiary tabular-nums">
                    {selectedVisible} selected
                  </span>
                )}
              </div>
            )}

            <div className="space-y-2">
              {pageRows.map((item) => (
                <ApprovalRow
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  clash={clashes.get(item.id)}
                  variant={variant}
                  selected={selected.has(item.id)}
                  onToggleSelect={() => toggleSel(item.id)}
                  onOpen={() => setOpenId(item.id)}
                  onApprove={() => approveOne(item)}
                  busy={actingId === item.id}
                />
              ))}
            </div>

            <div className="flex items-center gap-3 text-small text-text-tertiary">
              <span>
                Showing {(safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  aria-label="Page size"
                  className="h-7 rounded-md bg-surface-elevated/60 border border-border-subtle px-1.5"
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                  className="px-2 py-1 rounded-md border border-border-subtle disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="tabular-nums">
                  {safePage}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(safePage + 1)}
                  className="px-2 py-1 rounded-md border border-border-subtle disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        {selectedItems.length > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-2xl border border-border-strong bg-surface-elevated/95 backdrop-blur px-4 py-2.5 shadow-panel">
            <span className="text-small text-text-primary">
              <b>{selectedItems.length}</b> selected
            </span>
            <button
              type="button"
              aria-label="Approve selected"
              disabled={!bulkAllowed}
              onClick={() => approveMany(selectedItems.map((i) => i.id))}
              className="soft-glow bg-accent-500 text-canvas text-small font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
            >
              Approve {selectedItems.length}
            </button>
            {!bulkAllowed && (
              <span className="text-[11px] text-text-tertiary">
                Select one type to bulk-approve
              </span>
            )}
            <button
              type="button"
              onClick={clearSel}
              className="text-small text-text-tertiary hover:text-text-primary"
            >
              Clear
            </button>
          </div>
        )}

        <Drawer
          item={openItem}
          onClose={() => setOpenId(null)}
          onActed={() => {
            setOpenId(null)
            if (queue) void refetch()
            else inbox?.refresh()
          }}
        />
      </div>
    </TooltipProvider>
  )
}
