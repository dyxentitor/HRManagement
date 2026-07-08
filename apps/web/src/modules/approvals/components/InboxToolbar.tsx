import { Flame, Search } from "lucide-react"

import { cn } from "@/lib/utils"

export interface InboxToolbarProps {
  search: string
  onSearch: (s: string) => void
  /** When provided, an Overdue lens toggle is shown. Omit for pages without an age signal. */
  overdueOnly?: boolean
  onToggleOverdue?: () => void
  overdueCount?: number
}

/** Lightweight toolbar for the All / Leave / KPI inbox pages: search plus an optional
 * Overdue lens. Mirrors the shape of the richer claims ApprovalToolbar without its tabs. */
export function InboxToolbar({
  search,
  onSearch,
  overdueOnly,
  onToggleOverdue,
  overdueCount,
}: InboxToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[180px] flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-tertiary" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name, department, type…"
          aria-label="Search approvals"
          className="w-full h-8 rounded-lg bg-surface-elevated/60 border border-border-subtle pl-8 pr-2 text-small text-text-primary"
        />
      </div>

      {onToggleOverdue && (
        <button
          type="button"
          onClick={onToggleOverdue}
          aria-pressed={overdueOnly}
          aria-label="Overdue"
          className={cn(
            "inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-small transition-colors",
            overdueOnly
              ? "border-coral/60 bg-coral/10 text-coral"
              : "border-border-subtle text-text-secondary hover:text-text-primary",
          )}
        >
          <Flame className="size-3.5" /> Overdue
          {overdueCount ? <b className="tabular-nums text-coral">{overdueCount}</b> : null}
        </button>
      )}
    </div>
  )
}
