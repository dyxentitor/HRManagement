import { Ban, ChevronDown, ChevronUp, ChevronsUpDown, Pencil, Plus, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { StatusPill } from "@/components/hrms"
import { PageHeader } from "@/components/shell/PageHeader"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useCan } from "@/lib/perm"
import { cn } from "@/lib/utils"
import {
  type BondCoverageRow,
  type BondCoverageStatus,
  incentiveApi,
} from "@/modules/incentive/api"

import { BondModal } from "./BondModal"

const PAGE_SIZE = 10

type SortKey = "name" | "status"
type SortDir = "asc" | "desc"
type ChipFilter = BondCoverageStatus | "all"

const STATUS_META: Record<
  BondCoverageStatus,
  { label: string; tone: "mint" | "yellow" | "coral" | "lavender" }
> = {
  active: { label: "Active", tone: "mint" },
  pending: { label: "Awaiting acceptance", tone: "yellow" },
  expired: { label: "Expired", tone: "coral" },
  none: { label: "No bond", tone: "lavender" },
}

const STATUS_ORDER: Record<BondCoverageStatus, number> = {
  active: 0,
  pending: 1,
  expired: 2,
  none: 3,
}

function fmtPeriod(row: BondCoverageRow): string {
  if (!row.bond) return "—"
  return `${row.bond.period_start} → ${row.bond.period_end}`
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="size-3 text-text-tertiary ml-1" />
  return sortDir === "asc" ? (
    <ChevronUp className="size-3 text-accent-200 ml-1" />
  ) : (
    <ChevronDown className="size-3 text-accent-200 ml-1" />
  )
}

export default function BondsPage() {
  const canAdmin = useCan("incentive:admin")

  const [rows, setRows] = useState<BondCoverageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [chip, setChip] = useState<ChipFilter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [page, setPage] = useState(1)

  const [modalRow, setModalRow] = useState<BondCoverageRow | null>(null)
  const [revokeRow, setRevokeRow] = useState<BondCoverageRow | null>(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await incentiveApi.bonds.coverage())
    } catch {
      toast.error("Failed to load bond coverage.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canAdmin) void fetchRows()
  }, [canAdmin, fetchRows])

  const counts = useMemo(() => {
    const c: Record<BondCoverageStatus, number> = { active: 0, pending: 0, expired: 0, none: 0 }
    for (const r of rows) c[r.status] += 1
    return c
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return rows
      .filter(
        (r) =>
          (chip === "all" || r.status === chip) &&
          (!q ||
            r.employee_name.toLowerCase().includes(q) ||
            r.employee_code.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const cmp =
          sortKey === "name"
            ? a.employee_name.localeCompare(b.employee_name)
            : STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        return sortDir === "asc" ? cmp : -cmp
      })
  }, [rows, query, chip, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
    setPage(1)
  }

  async function handleRevoke() {
    if (!revokeRow?.bond) return
    try {
      await incentiveApi.bonds.revoke(revokeRow.bond.id)
      toast.success("Bond revoked.")
      void fetchRows()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke bond.")
    } finally {
      setRevokeRow(null)
    }
  }

  if (!canAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Bonds" />
        <p className="text-text-secondary">You don't have permission to manage bonds.</p>
      </div>
    )
  }

  const thBtn =
    "flex items-center text-left font-medium text-text-tertiary text-label pb-2 hover:text-text-secondary transition-colors"

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Bonds" subtitle="Mandays incentive bonds — eligibility for claiming." />

      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_META) as BondCoverageStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setChip((c) => (c === s ? "all" : s))
              setPage(1)
            }}
            aria-pressed={chip === s}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-small transition-colors",
              chip === s
                ? "border-accent-400 bg-accent-500/15 text-text-primary"
                : "border-border-subtle text-text-secondary hover:bg-surface-hover",
            )}
          >
            <StatusPill tone={STATUS_META[s].tone} label={STATUS_META[s].label} />
            <span className="font-semibold">{counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="glass-surface rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 className="text-body font-semibold">Employees</h3>
          <div className="flex items-center gap-1.5 bg-canvas border border-border-subtle rounded-md px-2.5 py-1.5">
            <Search className="size-3.5 text-text-tertiary" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search…"
              aria-label="Search employees"
              className="bg-transparent text-small focus:outline-none w-32"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-2" aria-label="Loading bond coverage">
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-small text-text-tertiary py-6 text-center">
            {rows.length === 0 ? "No active employees." : "No employees match this filter."}
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
                      Employee
                      <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left font-medium pb-2">Bond period</th>
                  <th className="text-left font-medium pb-2">Terms</th>
                  <th
                    className="text-left font-medium pb-2"
                    aria-sort={
                      sortKey === "status"
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button type="button" className={thBtn} onClick={() => toggleSort("status")}>
                      Status
                      <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left font-medium pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.employee_id} className="border-t border-border-subtle">
                    <td className="py-2.5">
                      <span className="font-medium text-text-primary">{r.employee_name}</span>{" "}
                      <span className="text-text-tertiary text-[11px]">{r.employee_code}</span>
                    </td>
                    <td className="py-2.5 text-text-secondary">{fmtPeriod(r)}</td>
                    <td className="py-2.5 text-text-secondary">{r.bond?.terms_version ?? "—"}</td>
                    <td className="py-2.5">
                      <StatusPill
                        tone={STATUS_META[r.status].tone}
                        label={STATUS_META[r.status].label}
                      />
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        {r.bond === null ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setModalRow(r)}
                            className="h-7 px-2 gap-1 text-[11px] [&_svg]:size-3.5 text-accent-300 hover:text-accent-200"
                          >
                            <Plus /> Create bond
                          </Button>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setModalRow(r)}
                              className="h-7 px-2 gap-1 text-[11px] [&_svg]:size-3.5 text-accent-300 hover:text-accent-200"
                            >
                              <Pencil /> Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setRevokeRow(r)}
                              className="h-7 px-2 gap-1 text-[11px] [&_svg]:size-3.5 text-coral hover:text-coral/80"
                            >
                              <Ban /> Revoke
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between mt-3 text-small text-text-tertiary">
              <span>
                {rangeStart}–{rangeEnd} of {filtered.length}
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-7 px-2 text-[11px]"
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-7 px-2 text-[11px]"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <BondModal
        row={modalRow}
        open={modalRow !== null}
        onOpenChange={(o) => {
          if (!o) setModalRow(null)
        }}
        onDone={() => void fetchRows()}
      />
      <ConfirmDialog
        open={revokeRow !== null}
        onOpenChange={(o) => {
          if (!o) setRevokeRow(null)
        }}
        title={`Revoke ${revokeRow?.employee_name}'s bond?`}
        description="They immediately lose claim eligibility. The bond details are kept in the audit log."
        variant="danger"
        onConfirm={() => void handleRevoke()}
      />
    </div>
  )
}
