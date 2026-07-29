import {
  Ban,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Coins,
  Pencil,
  RotateCcw,
  Search,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { StatusPill } from "@/components/hrms"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useCan } from "@/lib/perm"

import { type Customer, incentiveApi } from "../api"
import { EditCustomerModal, TopUpModal } from "./IncentiveModals"

type SortKey = "name" | "status"
type SortDir = "asc" | "desc"

const PAGE_SIZE = 10

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="size-3 text-text-tertiary ml-1" />
  return sortDir === "asc" ? (
    <ChevronUp className="size-3 text-accent-200 ml-1" />
  ) : (
    <ChevronDown className="size-3 text-accent-200 ml-1" />
  )
}

interface Props {
  onChanged: () => void
}

export function CustomersTable({ onChanged }: Props) {
  const canAdmin = useCan("incentive:admin")

  const [rows, setRows] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [page, setPage] = useState(1)
  const [includeInactive, setIncludeInactive] = useState(false)

  // Edit modal
  const [editTarget, setEditTarget] = useState<Customer | null>(null)
  // TopUp modal
  const [topUpTarget, setTopUpTarget] = useState<Customer | null>(null)
  // Confirm dialog (deactivate / reactivate)
  const [confirmTarget, setConfirmTarget] = useState<Customer | null>(null)

  const fetchRows = useCallback(async (inactive: boolean) => {
    setLoading(true)
    try {
      const data = await incentiveApi.customers.list({ includeInactive: inactive })
      setRows(data)
    } catch {
      toast.error("Failed to load customers.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchRows(includeInactive)
  }, [fetchRows, includeInactive])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
    setPage(1)
  }

  function handleIncludeInactiveChange(checked: boolean) {
    setIncludeInactive(checked)
    setPage(1)
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return rows
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => {
        let cmp = 0
        if (sortKey === "name") {
          cmp = a.name.localeCompare(b.name)
        } else {
          // status: active first in asc
          cmp = a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1
        }
        return sortDir === "asc" ? cmp : -cmp
      })
  }, [rows, query, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length)

  async function handleConfirm() {
    if (!confirmTarget) return
    try {
      if (confirmTarget.is_active) {
        await incentiveApi.customers.deactivate(confirmTarget.id)
        toast.success("Customer deactivated.")
      } else {
        await incentiveApi.customers.reactivate(confirmTarget.id)
        toast.success("Customer reactivated.")
      }
      void fetchRows(includeInactive)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.")
    } finally {
      setConfirmTarget(null)
    }
  }

  const thBtn =
    "flex items-center text-left font-medium text-text-tertiary text-label pb-2 hover:text-text-secondary transition-colors"

  return (
    <div className="glass-surface rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-body font-semibold">Customers</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-canvas border border-border-subtle rounded-md px-2.5 py-1.5">
            <Search className="size-3.5 text-text-tertiary" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search…"
              aria-label="Search customers"
              className="bg-transparent text-small focus:outline-none w-28"
            />
          </div>
          <label className="flex items-center gap-1.5 text-small text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => handleIncludeInactiveChange(e.target.checked)}
              aria-label="Show inactive"
            />
            Show inactive
          </label>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" aria-label="Loading customers">
          <Skeleton className="h-9 rounded-md" />
          <Skeleton className="h-9 rounded-md" />
          <Skeleton className="h-9 rounded-md" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-small text-text-tertiary py-6 text-center">
          No customers yet — add one to load a pool.
        </p>
      ) : (
        <>
          <table className="w-full text-small">
            <thead>
              <tr className="text-label text-text-tertiary">
                <th
                  className="text-left font-medium pb-2"
                  aria-sort={
                    sortKey === "name" ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  <button type="button" className={thBtn} onClick={() => toggleSort("name")}>
                    Name
                    <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th className="text-left font-medium pb-2">Pool</th>
                <th
                  className="text-left font-medium pb-2"
                  aria-sort={
                    sortKey === "status" ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  <button type="button" className={thBtn} onClick={() => toggleSort("status")}>
                    Status
                    <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th className="text-left font-medium pb-2 max-w-[180px]">Notes</th>
                {canAdmin && <th className="text-left font-medium pb-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => (
                <tr key={c.id} className="border-t border-border-subtle">
                  <td className="py-2.5 font-medium text-text-primary">{c.name}</td>
                  <td className="py-2.5 text-text-secondary">
                    {Number(c.mandays_remaining).toLocaleString("en-MY", {
                      maximumFractionDigits: 0,
                    })}
                    {" / "}
                    {Number(c.mandays_total).toLocaleString("en-MY", { maximumFractionDigits: 0 })}
                    {" md"}
                  </td>
                  <td className="py-2.5">
                    <StatusPill
                      tone={c.is_active ? "mint" : "lavender"}
                      label={c.is_active ? "Active" : "Inactive"}
                    />
                  </td>
                  <td className="py-2.5 max-w-[180px]">
                    <span className="block truncate text-text-secondary" title={c.notes}>
                      {c.notes || <span className="text-text-tertiary">—</span>}
                    </span>
                  </td>
                  {canAdmin && (
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setEditTarget(c)}
                          className="h-7 px-2 gap-1 text-[11px] [&_svg]:size-3.5 text-accent-300 hover:text-accent-200"
                        >
                          <Pencil /> Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setTopUpTarget(c)}
                          className="h-7 px-2 gap-1 text-[11px] [&_svg]:size-3.5 text-sky hover:text-sky/80"
                        >
                          <Coins /> Top up
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setConfirmTarget(c)}
                          className={
                            c.is_active
                              ? "h-7 px-2 gap-1 text-[11px] [&_svg]:size-3.5 text-coral hover:text-coral/80"
                              : "h-7 px-2 gap-1 text-[11px] [&_svg]:size-3.5 text-mint hover:text-mint/80"
                          }
                        >
                          {c.is_active ? (
                            <>
                              <Ban /> Deactivate
                            </>
                          ) : (
                            <>
                              <RotateCcw /> Reactivate
                            </>
                          )}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
            <p className="text-[11px] text-text-tertiary">
              {rangeStart}–{rangeEnd} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="text-[11px] px-2.5 py-1 rounded-md border border-border-subtle text-text-secondary disabled:opacity-40 hover:bg-white/[0.04] transition-colors"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="text-[11px] px-2.5 py-1 rounded-md border border-border-subtle text-text-secondary disabled:opacity-40 hover:bg-white/[0.04] transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Edit modal */}
      <EditCustomerModal
        open={editTarget !== null}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null)
        }}
        onDone={() => {
          void fetchRows(includeInactive)
          onChanged()
        }}
        customer={editTarget}
      />

      {/* Top-up modal — wrap customer as a single-item pool shape */}
      <TopUpModal
        open={topUpTarget !== null}
        onOpenChange={(o) => {
          if (!o) setTopUpTarget(null)
        }}
        onDone={() => {
          void fetchRows(includeInactive)
          onChanged()
        }}
        pools={
          topUpTarget
            ? [
                {
                  id: topUpTarget.id,
                  name: topUpTarget.name,
                  remaining: topUpTarget.mandays_remaining,
                  total: topUpTarget.mandays_total,
                  project_count: 0,
                  pct_used: 0,
                },
              ]
            : []
        }
      />

      {/* Confirm deactivate / reactivate */}
      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmTarget(null)
        }}
        title={confirmTarget?.is_active ? "Deactivate customer?" : "Reactivate customer?"}
        description={
          confirmTarget?.is_active
            ? "This hides the customer from new projects but keeps all historical data."
            : "The customer will be available for new projects again."
        }
        variant={confirmTarget?.is_active ? "danger" : "default"}
        confirmLabel={confirmTarget?.is_active ? "Deactivate" : "Reactivate"}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
