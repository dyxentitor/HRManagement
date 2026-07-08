import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ClaimReviewDrawer } from "@/modules/approvals/components/ClaimReviewDrawer"

import {
  type ApprovalSummary,
  type ApprovalTab,
  type ClaimApprovalRow as Row,
  claimsApi,
} from "../api"
import { ApprovalToolbar } from "./ApprovalToolbar"
import { BulkApproveBar } from "./BulkApproveBar"
import { ClaimApprovalRow } from "./ClaimApprovalRow"
import {
  type ApprovalFilters,
  type ApprovalSort,
  EMPTY_APPROVAL_FILTERS,
  applyApprovalFilters,
  paginate,
} from "./approvals-filter"

export function ClaimsSegment({ onChanged }: { onChanged?: () => void }) {
  const [tab, setTab] = useState<ApprovalTab>("awaiting")
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<ApprovalSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<ApprovalSort>("urgency")
  const [filters, setFilters] = useState<ApprovalFilters>(EMPTY_APPROVAL_FILTERS)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const [q, s] = await Promise.all([
        claimsApi.approvalsQueue(tab),
        claimsApi.approvalsSummary(),
      ])
      setRows(q)
      setSummary(s)
      setSelected(new Set())
    } catch {
      setError(true)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset paging when the view changes
  useEffect(() => {
    setPage(1)
  }, [tab, search, sort, filters, pageSize])

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category_name))].sort(), [rows])
  const filtered = useMemo(
    () => applyApprovalFilters(rows, filters, search, sort),
    [rows, filters, search, sort],
  )
  const pageRows = useMemo(() => paginate(filtered, page, pageSize), [filtered, page, pageSize])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(r.id)),
    [filtered, selected],
  )

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function quickApprove(id: string) {
    try {
      await claimsApi.approve(id, "")
      toast.success("Claim approved")
      await refresh()
      onChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed")
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4 pb-16">
        <ApprovalToolbar
          tab={tab}
          onTab={setTab}
          search={search}
          onSearch={setSearch}
          sort={sort}
          onSort={setSort}
          filters={filters}
          onFilters={setFilters}
          categories={categories}
          awaitingCount={summary?.awaiting_count ?? 0}
          overdueCount={summary?.overdue_count ?? 0}
          highValueCount={summary?.high_value_count ?? 0}
        />

        {loading ? (
          <div className="space-y-2">
            {["a", "b", "c", "d"].map((k) => (
              <Skeleton key={k} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="glass-surface rounded-2xl p-8 text-center">
            <p className="text-text-secondary">Couldn't load approvals.</p>
            <Button type="button" className="mt-3" onClick={() => refresh()}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-surface-hover border border-dashed border-border-subtle rounded-xl p-10 text-center text-text-tertiary">
            {rows.length === 0
              ? tab === "awaiting"
                ? "All caught up. Nothing awaiting your approval. 🎉"
                : "No claims here yet."
              : "No claims match your filters."}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {pageRows.map((r) => (
                <ClaimApprovalRow
                  key={r.id}
                  row={r}
                  selected={selected.has(r.id)}
                  onToggleSelect={() => toggleSelect(r.id)}
                  onOpen={() => setPreviewId(r.id)}
                  onApprove={() => quickApprove(r.id)}
                />
              ))}
            </div>

            <div className="flex items-center gap-3 text-small text-text-tertiary">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of{" "}
                {filtered.length}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
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
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-2 py-1 rounded-md border border-border-subtle disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="tabular-nums">
                  {page}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2 py-1 rounded-md border border-border-subtle disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        <BulkApproveBar
          selected={selectedRows}
          onClear={() => setSelected(new Set())}
          onDone={() => {
            void refresh()
            onChanged?.()
          }}
        />

        <ClaimReviewDrawer
          claimId={previewId}
          onClose={() => setPreviewId(null)}
          onActed={() => {
            setPreviewId(null)
            void refresh()
            onChanged?.()
          }}
        />
      </div>
    </TooltipProvider>
  )
}
