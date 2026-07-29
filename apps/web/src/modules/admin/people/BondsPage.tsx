import { Ban, MoreHorizontal, Pencil, Plus, UserRound } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { DataTable, StatusPill } from "@/components/hrms"
import type { Column } from "@/components/hrms/DataTable"
import { PageHeader } from "@/components/shell/PageHeader"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useCan } from "@/lib/perm"
import { cn } from "@/lib/utils"
import {
  type BondCoverageRow,
  type BondCoverageStatus,
  incentiveApi,
} from "@/modules/incentive/api"

import { BondModal } from "./BondModal"

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

const FILTERS: { key: ChipFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Awaiting" },
  { key: "expired", label: "Expired" },
  { key: "none", label: "No bond" },
]

function fmtPeriod(row: BondCoverageRow): string {
  if (!row.bond) return "—"
  return `${row.bond.period_start} → ${row.bond.period_end}`
}

export default function BondsPage() {
  const canAdmin = useCan("incentive:admin")

  const [rows, setRows] = useState<BondCoverageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<ChipFilter>("all")

  const [modalRow, setModalRow] = useState<BondCoverageRow | null>(null)
  const [revokeRow, setRevokeRow] = useState<BondCoverageRow | null>(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      setRows(await incentiveApi.bonds.coverage())
    } catch {
      setFailed(true)
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

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (!term ||
          r.employee_name.toLowerCase().includes(term) ||
          r.employee_code.toLowerCase().includes(term)),
    )
  }, [rows, query, filter])

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

  const columns: Column<BondCoverageRow>[] = [
    {
      key: "employee",
      header: "Employee",
      sortable: true,
      sortValue: (r) => r.employee_name.toLowerCase(),
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <span className="size-7 rounded-lg grid place-items-center bg-lavender/20 text-lavender shrink-0">
            <UserRound className="size-4" />
          </span>
          <span className="text-text-primary">{r.employee_name}</span>
          <span className="text-text-tertiary">· {r.employee_code}</span>
        </div>
      ),
    },
    {
      key: "period",
      header: "Bond period",
      sortable: true,
      sortValue: (r) => r.bond?.period_start ?? "9999",
      render: (r) => <span className="text-text-secondary">{fmtPeriod(r)}</span>,
    },
    {
      key: "terms",
      header: "Terms",
      render: (r) =>
        r.bond ? (
          <span className="text-[10px] rounded-md bg-surface-elevated/60 px-1.5 py-0.5 text-text-secondary">
            {r.bond.terms_version}
          </span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortValue: (r) => STATUS_ORDER[r.status],
      render: (r) => <StatusPill tone={STATUS_META[r.status].tone} label={STATUS_META[r.status].label} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${r.employee_name}`}
              className="size-7 grid place-items-center rounded-lg text-text-tertiary hover:bg-surface-elevated/60"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {r.bond === null ? (
              <DropdownMenuItem onClick={() => setModalRow(r)}>
                <Plus className="size-4 mr-2" /> Create bond
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={() => setModalRow(r)}>
                  <Pencil className="size-4 mr-2" /> Edit bond
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setRevokeRow(r)}
                  className="text-coral focus:text-coral"
                >
                  <Ban className="size-4 mr-2" /> Revoke
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  if (!canAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Bonds" />
        <p className="text-text-secondary">You don't have permission to manage bonds.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Bonds" subtitle="Mandays incentive bonds — eligibility for claiming." />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-xl bg-surface-elevated/60 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "text-small rounded-lg px-3 py-1.5 transition-colors",
                filter === f.key
                  ? "bg-accent-500/20 text-accent-100"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {f.label}
              {f.key !== "all" && (
                <span className="ml-1.5 text-[10px] text-text-tertiary">
                  {counts[f.key as BondCoverageStatus]}
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search employee or code…"
          aria-label="Search employees"
          className="h-8 min-w-[200px] flex-1 max-w-xs rounded-lg bg-surface-elevated/60 border border-border-subtle px-3 text-small text-text-primary"
        />
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : failed ? (
        <div className="glass-surface rounded-2xl p-8 text-center">
          <p className="text-text-secondary">Couldn't load bond coverage.</p>
          <Button type="button" onClick={() => void fetchRows()} className="mt-3">
            Try again
          </Button>
        </div>
      ) : (
        <DataTable<BondCoverageRow>
          rows={visible}
          columns={columns}
          rowKey={(r) => r.employee_id}
          emptyState={
            <p className="text-text-tertiary text-center py-8">
              {rows.length === 0 ? "No active employees." : "No employees match this filter."}
            </p>
          }
        />
      )}

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
