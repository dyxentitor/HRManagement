import type { FC } from "react"
import { useState } from "react"
import { toast } from "sonner"

import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"

import type { InboxItem } from "../api"
import { matchesInboxSearch } from "../lib/inbox-filter"
import type { Clash, UseApprovalInbox } from "../useApprovalInbox"
import { ApprovalRow } from "./ApprovalRow"
import type { LensTone } from "./WorkspaceToolbar"
import { type ToolbarLens, WorkspaceToolbar } from "./WorkspaceToolbar"

export type WorkspaceCtx = { clashes: Map<string, Clash> }

export interface WorkspaceLens {
  key: string
  label: string
  icon: ToolbarLens["icon"]
  tone: LensTone
  predicate: (item: InboxItem, ctx: WorkspaceCtx) => boolean
}

export interface WorkspaceSort {
  key: string
  label: string
  make: (ctx: WorkspaceCtx) => (a: InboxItem, b: InboxItem) => number
}

export interface WorkspaceDescriptor {
  emptyLabel: string
  lenses: WorkspaceLens[]
  sorts: WorkspaceSort[]
  typeFilter?: boolean
  DetailDrawer: FC<{ item: InboxItem | null; onClose: () => void; onActed: () => void }>
}

const TYPE_OPTS = [
  { value: "all", label: "All" },
  { value: "claim", label: "Claims" },
  { value: "leave", label: "Leave" },
  { value: "kpi", label: "KPI" },
]

export function ApprovalWorkspace({
  inbox,
  filterKind,
  descriptor,
}: {
  inbox: UseApprovalInbox
  filterKind?: InboxItem["kind"]
  descriptor: WorkspaceDescriptor
}) {
  const [search, setSearch] = useState("")
  const [activeLens, setActiveLens] = useState<string | null>(null)
  const [sort, setSort] = useState(descriptor.sorts[0]?.key ?? "urgency")
  const [type, setType] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [openId, setOpenId] = useState<string | null>(null)

  const ctx: WorkspaceCtx = { clashes: inbox.clashes }

  // kind-scoped base (typed pages) or type-filtered base (all page)
  const kindScoped = filterKind ? inbox.items.filter((i) => i.kind === filterKind) : inbox.items
  const base = !filterKind && type !== "all" ? kindScoped.filter((i) => i.kind === type) : kindScoped

  const lenses: ToolbarLens[] = descriptor.lenses.map((l) => ({
    key: l.key,
    label: l.label,
    icon: l.icon,
    tone: l.tone,
    count: base.filter((i) => l.predicate(i, ctx)).length,
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

  const selectedItems = base.filter((i) => inbox.selected.has(i.id))
  const singleKind = new Set(selectedItems.map((i) => i.kind)).size === 1
  const bulkAllowed = selectedItems.length > 0 && singleKind

  async function quickApprove(item: InboxItem) {
    try {
      await inbox.approve(item, "")
      toast.success("Approved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed")
    }
  }

  const openItem = openId ? (inbox.items.find((i) => i.id === openId) ?? null) : null
  const Drawer = descriptor.DetailDrawer

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-3 pb-16">
        <WorkspaceToolbar
          awaiting={base.length}
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
          typeFilter={
            !filterKind && descriptor.typeFilter
              ? {
                  value: type,
                  options: TYPE_OPTS,
                  onChange: (v) => {
                    setType(v)
                    setPage(1)
                    inbox.clearSelection()
                  },
                }
              : undefined
          }
        />

        {inbox.loading ? (
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
            <div className="space-y-2">
              {pageRows.map((item) => (
                <ApprovalRow
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  clash={inbox.clashes.get(item.id)}
                  variant={filterKind ? "typed" : "all"}
                  selected={inbox.selected.has(item.id)}
                  onToggleSelect={() => inbox.toggle(item.id)}
                  onOpen={() => setOpenId(item.id)}
                  onApprove={() => quickApprove(item)}
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
              onClick={() => inbox.approveIds(selectedItems.map((i) => i.id))}
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
              onClick={inbox.clearSelection}
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
            void inbox.refresh()
          }}
        />
      </div>
    </TooltipProvider>
  )
}
