import { ListFilter, Search, X } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { ApprovalTab } from "../api"
import {
  type ApprovalFilters,
  type ApprovalSort,
  hasActiveApprovalFilters,
} from "./approvals-filter"

const TABS: { key: ApprovalTab; label: string }[] = [
  { key: "awaiting", label: "Awaiting you" },
  { key: "all", label: "All" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
]

const SORTS: { key: ApprovalSort; label: string }[] = [
  { key: "urgency", label: "Urgency" },
  { key: "newest", label: "Newest" },
  { key: "amount", label: "Amount high→low" },
]

export interface ApprovalToolbarProps {
  tab: ApprovalTab
  onTab: (t: ApprovalTab) => void
  search: string
  onSearch: (s: string) => void
  sort: ApprovalSort
  onSort: (s: ApprovalSort) => void
  filters: ApprovalFilters
  onFilters: (f: ApprovalFilters) => void
  categories: string[]
  awaitingCount: number
}

export function ApprovalToolbar({
  tab,
  onTab,
  search,
  onSearch,
  sort,
  onSort,
  filters,
  onFilters,
  categories,
  awaitingCount,
}: ApprovalToolbarProps) {
  const activeCount =
    (filters.category ? 1 : 0) +
    (filters.minAmount !== null ? 1 : 0) +
    (filters.overdueOnly ? 1 : 0) +
    (filters.highValueOnly ? 1 : 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-surface-elevated/60 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTab(t.key)}
              className={cn(
                "text-small rounded-lg px-3 py-1.5 transition-colors",
                tab === t.key
                  ? "bg-accent-500/20 text-accent-100"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {t.label}
              {t.key === "awaiting" ? ` · ${awaitingCount}` : ""}
            </button>
          ))}
        </div>

        <div className="relative min-w-[180px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-tertiary" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search employee, merchant, claim #…"
            aria-label="Search claims"
            className="w-full h-8 rounded-lg bg-surface-elevated/60 border border-border-subtle pl-8 pr-2 text-small text-text-primary"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Filters"
              className={cn(
                "inline-flex items-center gap-1.5 h-8 rounded-lg border px-2.5 text-small",
                activeCount > 0
                  ? "border-accent-500/60 text-accent-100"
                  : "border-border-subtle text-text-secondary",
              )}
            >
              <ListFilter className="size-4" /> Filters
              {activeCount > 0 && (
                <span className="bg-accent-500 text-canvas font-bold rounded-full px-1.5 text-[10px]">
                  {activeCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3">
            <div>
              <p className="text-[9px] tracking-wider text-text-tertiary mb-1.5">CATEGORY</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() =>
                      onFilters({ ...filters, category: filters.category === c ? null : c })
                    }
                    className={cn(
                      "text-[11px] rounded-full px-2.5 py-1 border",
                      filters.category === c
                        ? "bg-accent-500 text-canvas border-accent-500"
                        : "bg-surface-elevated/60 text-text-secondary border-border-subtle",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] tracking-wider text-text-tertiary mb-1.5">MIN AMOUNT</p>
              <input
                type="number"
                min="0"
                value={filters.minAmount ?? ""}
                onChange={(e) =>
                  onFilters({
                    ...filters,
                    minAmount: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="0"
                aria-label="Minimum amount"
                className="w-full h-8 rounded-lg bg-surface-elevated/60 border border-border-subtle px-2 text-small text-text-primary"
              />
            </div>
            {hasActiveApprovalFilters(filters) && (
              <button
                type="button"
                onClick={() =>
                  onFilters({
                    category: null,
                    minAmount: null,
                    overdueOnly: false,
                    highValueOnly: false,
                  })
                }
                className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary"
              >
                <X className="size-3.5" /> Clear all
              </button>
            )}
          </PopoverContent>
        </Popover>

        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as ApprovalSort)}
          aria-label="Sort"
          className="h-8 rounded-lg bg-surface-elevated/60 border border-border-subtle px-2 text-small text-text-secondary"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {(filters.overdueOnly ||
        filters.highValueOnly ||
        filters.category ||
        filters.minAmount !== null) && (
        <div className="flex flex-wrap gap-1.5">
          {filters.overdueOnly && (
            <Chip label="Overdue" onClear={() => onFilters({ ...filters, overdueOnly: false })} />
          )}
          {filters.highValueOnly && (
            <Chip
              label="High value"
              onClear={() => onFilters({ ...filters, highValueOnly: false })}
            />
          )}
          {filters.category && (
            <Chip
              label={`Category: ${filters.category}`}
              onClear={() => onFilters({ ...filters, category: null })}
            />
          )}
          {filters.minAmount !== null && (
            <Chip
              label={`≥ RM ${filters.minAmount}`}
              onClear={() => onFilters({ ...filters, minAmount: null })}
            />
          )}
        </div>
      )}
    </div>
  )
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 max-w-[200px] bg-accent-500/15 text-accent-100 border border-accent-500/30 text-[11px] rounded-full px-2.5 py-1"
    >
      <span className="truncate">{label}</span>
      <X className="size-3 shrink-0" />
    </button>
  )
}
