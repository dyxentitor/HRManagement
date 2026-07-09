import type { LucideIcon } from "lucide-react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"

export type LensTone = "coral" | "amber" | "violet"

export interface ToolbarLens {
  key: string
  label: string
  icon: LucideIcon
  tone: LensTone
  count: number
}

const ON_TONE: Record<LensTone, string> = {
  coral: "border-coral/60 bg-coral/10 text-coral",
  amber: "border-yellow/60 bg-yellow/10 text-yellow",
  violet: "border-accent-500/60 bg-accent-500/10 text-accent-100",
}

export interface TypeFilterOpt {
  value: string
  label: string
}

export interface ToolbarTabs {
  items: { key: string; label: string }[]
  value: string
  onChange: (key: string) => void
}

export interface WorkspaceToolbarProps {
  awaiting: number
  search: string
  onSearch: (s: string) => void
  lenses: ToolbarLens[]
  activeLens: string | null
  onLens: (key: string | null) => void
  sorts: { key: string; label: string }[]
  sort: string
  onSort: (key: string) => void
  typeFilter?: { value: string; options: TypeFilterOpt[]; onChange: (v: string) => void }
  tabs?: ToolbarTabs
}

/** Claims-style toolbar minus the history tabs: an awaiting count + search +
 * lens toggle chips + optional type filter + sort. */
export function WorkspaceToolbar({
  awaiting,
  search,
  onSearch,
  lenses,
  activeLens,
  onLens,
  sorts,
  sort,
  onSort,
  typeFilter,
  tabs,
}: WorkspaceToolbarProps) {
  return (
    <div className="flex flex-col gap-2">
      {tabs && (
        <div className="inline-flex self-start rounded-xl bg-surface-elevated/60 p-0.5">
          {tabs.items.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => tabs.onChange(t.key)}
              className={cn(
                "text-small rounded-lg px-3 py-1.5 transition-colors",
                tabs.value === t.key
                  ? "bg-accent-500/20 text-accent-100"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {t.label}
              {t.key === "awaiting" ? ` · ${awaiting}` : ""}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!tabs && (
          <span className="text-small text-text-secondary tabular-nums shrink-0">
            <b className="text-text-primary">{awaiting}</b> awaiting
          </span>
        )}

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

        {typeFilter && (
          <div className="inline-flex rounded-lg bg-surface-elevated/60 p-0.5">
            {typeFilter.options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => typeFilter.onChange(o.value)}
                className={cn(
                  "text-small rounded-md px-2.5 py-1 transition-colors",
                  typeFilter.value === o.value
                    ? "bg-accent-500/20 text-accent-100"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {lenses.map((lens) => {
          const on = activeLens === lens.key
          const Icon = lens.icon
          return (
            <button
              key={lens.key}
              type="button"
              onClick={() => onLens(on ? null : lens.key)}
              aria-pressed={on}
              aria-label={lens.label}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-small transition-colors",
                on
                  ? ON_TONE[lens.tone]
                  : "border-border-subtle text-text-secondary hover:text-text-primary",
              )}
            >
              <Icon className="size-3.5" /> {lens.label}
              {lens.count > 0 && <b className="tabular-nums">{lens.count}</b>}
            </button>
          )
        })}

        <select
          value={sort}
          onChange={(e) => onSort(e.target.value)}
          aria-label="Sort"
          className="ml-auto h-8 rounded-lg bg-surface-elevated/60 border border-border-subtle px-2 text-small text-text-secondary"
        >
          {sorts.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
