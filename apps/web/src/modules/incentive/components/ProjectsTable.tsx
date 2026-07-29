import {
  Archive,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Lock,
  Pencil,
  RotateCcw,
  Search,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { StatusPill } from "@/components/hrms"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useCan } from "@/lib/perm"
import { cn } from "@/lib/utils"

import { type OverviewProject, type Project, incentiveApi } from "../api"
import { EditProjectModal } from "./IncentiveModals"

const PAGE_SIZE = 10

type SortKey = "name" | "budget" | "deadline" | "status"
type SortDir = "asc" | "desc"

function pct(consumed: string, budget: string): number {
  const b = Number(budget)
  return b > 0 ? Math.min(100, Math.round((Number(consumed) / b) * 100)) : 0
}

function barTone(p: number): string {
  if (p >= 90) return "from-coral to-peach"
  if (p >= 70) return "from-yellow to-peach"
  return "from-mint to-sky"
}

function DeadlineChip({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span className="text-text-tertiary">—</span>
  const due = new Date(`${deadline}T00:00:00`)
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000)
  const tone = days < 0 ? "text-coral" : days <= 7 ? "text-yellow" : "text-text-tertiary"
  const label = days < 0 ? "overdue" : days === 0 ? "today" : `${days}d`
  return (
    <span className={cn("text-[10px]", tone)}>
      {deadline} · {label}
    </span>
  )
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="size-3 text-text-tertiary ml-1" />
  return sortDir === "asc" ? (
    <ChevronUp className="size-3 text-accent-200 ml-1" />
  ) : (
    <ChevronDown className="size-3 text-accent-200 ml-1" />
  )
}

interface Props {
  projects: OverviewProject[]
  onChanged?: () => void
}

export function ProjectsTable({ projects, onChanged }: Props) {
  const canAct = useCan("incentive:admin") || useCan("incentive:project:write")

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | "open" | "closed">("all")
  const [customer, setCustomer] = useState("all")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [page, setPage] = useState(1)

  // Edit modal — needs full Project (description + include_soc)
  // OverviewProject lacks description, so we fetch full record on open.
  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  // Confirm close / reopen
  const [closeTarget, setCloseTarget] = useState<OverviewProject | null>(null)
  const [reopenTarget, setReopenTarget] = useState<OverviewProject | null>(null)

  const customers = useMemo(
    () => [...new Set(projects.map((p) => p.customer_name))].sort(),
    [projects],
  )

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
    setPage(1)
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return projects.filter(
      (p) =>
        (status === "all" || p.status === status) &&
        (customer === "all" || p.customer_name === customer) &&
        (!q || p.name.toLowerCase().includes(q) || p.customer_name.toLowerCase().includes(q)),
    )
  }, [projects, query, status, customer])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name)
      } else if (sortKey === "budget") {
        cmp = Number(a.budget) - Number(b.budget)
      } else if (sortKey === "deadline") {
        // nulls last regardless of sort direction
        if (!a.deadline && !b.deadline) cmp = 0
        else if (!a.deadline) cmp = 1
        else if (!b.deadline) cmp = -1
        else cmp = a.deadline.localeCompare(b.deadline)
      } else if (sortKey === "status") {
        // open < closed in asc
        cmp = a.status === b.status ? 0 : a.status === "open" ? -1 : 1
      }
      return sortDir === "asc"
        ? cmp
        : sortKey === "deadline" && (!a.deadline || !b.deadline)
          ? cmp // nulls always last, never flip
          : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(safePage * PAGE_SIZE, sorted.length)

  async function openEdit(p: OverviewProject) {
    setEditLoading(true)
    try {
      const all = await incentiveApi.projects.list()
      const full = all.find((r) => r.id === p.id) ?? null
      setEditTarget(full)
    } catch {
      toast.error("Could not load project details.")
    } finally {
      setEditLoading(false)
    }
  }

  async function handleClose() {
    if (!closeTarget) return
    try {
      await incentiveApi.projects.close(closeTarget.id)
      toast.success("Project closed.")
      onChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not close project.")
    } finally {
      setCloseTarget(null)
    }
  }

  async function handleReopen() {
    if (!reopenTarget) return
    try {
      await incentiveApi.projects.reopen(reopenTarget.id)
      toast.success("Project reopened.")
      onChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reopen project.")
    } finally {
      setReopenTarget(null)
    }
  }

  const ctrl =
    "bg-canvas border border-border-subtle rounded-md px-2.5 py-1.5 text-small text-text-secondary"

  const thBtn =
    "flex items-center text-left font-medium text-text-tertiary text-label pb-2 hover:text-text-secondary transition-colors"

  return (
    <div className="glass-surface rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-body font-semibold">Projects</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-canvas border border-border-subtle rounded-md px-2.5 py-1.5">
            <Search className="size-3.5 text-text-tertiary" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search…"
              aria-label="Search projects"
              className="bg-transparent text-small focus:outline-none w-28"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status)
              setPage(1)
            }}
            aria-label="Status filter"
            className={ctrl}
          >
            <option value="all">All status</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={customer}
            onChange={(e) => {
              setCustomer(e.target.value)
              setPage(1)
            }}
            aria-label="Customer filter"
            className={ctrl}
          >
            <option value="all">All customers</option>
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-small text-text-tertiary py-6 text-center">No projects match.</p>
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
                    Project
                    <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th
                  className="text-left font-medium pb-2"
                  aria-sort={
                    sortKey === "budget" ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  <button type="button" className={thBtn} onClick={() => toggleSort("budget")}>
                    Budget
                    <SortIcon col="budget" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th className="text-left font-medium pb-2 w-36">Consumed</th>
                <th
                  className="text-left font-medium pb-2"
                  aria-sort={
                    sortKey === "deadline"
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button type="button" className={thBtn} onClick={() => toggleSort("deadline")}>
                    Deadline
                    <SortIcon col="deadline" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
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
                {canAct && <th className="text-left font-medium pb-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((p) => {
                const u = pct(p.consumed, p.budget)
                return (
                  <tr key={p.id} className="border-t border-border-subtle">
                    <td className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-primary font-medium">{p.name}</span>
                        {p.include_soc && <Lock className="size-3 text-text-tertiary" />}
                      </div>
                      <div className="text-[10px] text-text-tertiary">{p.customer_name}</div>
                    </td>
                    <td className="py-2.5 text-text-secondary">{p.budget} md</td>
                    <td className="py-2.5">
                      <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                        <div
                          className={cn("h-full rounded-full bg-gradient-to-r", barTone(u))}
                          style={{ width: `${u}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-text-tertiary mt-1">
                        {p.consumed} / {p.budget}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <DeadlineChip deadline={p.deadline} />
                    </td>
                    <td className="py-2.5">
                      <StatusPill
                        tone={p.status === "open" ? "mint" : "lavender"}
                        label={p.status === "open" ? "Open" : "Closed"}
                      />
                    </td>
                    {canAct && (
                      <td className="py-2.5">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={editLoading}
                            onClick={() => void openEdit(p)}
                            className="h-7 px-2 gap-1 text-[11px] [&_svg]:size-3.5 text-accent-300 hover:text-accent-200"
                          >
                            <Pencil /> Edit
                          </Button>
                          {p.status === "open" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setCloseTarget(p)}
                              className="h-7 px-2 gap-1 text-[11px] [&_svg]:size-3.5 text-coral hover:text-coral/80"
                            >
                              <Archive /> Close
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setReopenTarget(p)}
                              className="h-7 px-2 gap-1 text-[11px] [&_svg]:size-3.5 text-mint hover:text-mint/80"
                            >
                              <RotateCcw /> Reopen
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Pagination footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
            <p className="text-[11px] text-text-tertiary">
              {rangeStart}–{rangeEnd} of {sorted.length}
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

      {/* Edit modal — uses full Project record fetched on open */}
      <EditProjectModal
        open={editTarget !== null}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null)
        }}
        onDone={() => {
          onChanged?.()
        }}
        project={editTarget}
      />

      {/* Confirm close */}
      <ConfirmDialog
        open={closeTarget !== null}
        onOpenChange={(o) => {
          if (!o) setCloseTarget(null)
        }}
        title="Close project?"
        description="Closed projects stop accepting claims; history is kept."
        variant="danger"
        confirmLabel="Close"
        onConfirm={() => void handleClose()}
      />

      {/* Confirm reopen */}
      <ConfirmDialog
        open={reopenTarget !== null}
        onOpenChange={(o) => {
          if (!o) setReopenTarget(null)
        }}
        title="Reopen project?"
        description="The project will accept claims again."
        variant="default"
        confirmLabel="Reopen"
        onConfirm={() => void handleReopen()}
      />
    </div>
  )
}
