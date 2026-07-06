import { ChevronRight, GitBranch, LayoutGrid, ListFilter, Network, Search, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { gradientFromName } from "@/components/hrms/avatar-gradient"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import type { CardDensity } from "./OrgNodeCard"
import { orgChartApi } from "./api"
import { type OrgFilters, hasActiveFilters } from "./org-chart-filters"
import type { DepartmentGroup, OrgSearchHit } from "./types"

export type OrgView = "tree" | "department" | "reporting"

export interface Crumb {
  id: string
  label: string
}

export interface OrgChartControlsProps {
  view: OrgView
  onViewChange: (v: OrgView) => void
  filters: OrgFilters
  onFiltersChange: (f: OrgFilters) => void
  departments: DepartmentGroup[]
  onSearchSelect: (hit: OrgSearchHit) => void
  headcount: { people: number; departments: number }
  density: CardDensity
  onDensityChange: (d: CardDensity) => void
  showLevels: boolean
  onToggleLevels: () => void
  breadcrumbs: Crumb[]
  onCrumb: (id: string | null) => void
}

const VIEWS: { key: OrgView; label: string; icon: typeof Network }[] = [
  { key: "tree", label: "Tree", icon: Network },
  { key: "department", label: "Department", icon: LayoutGrid },
  { key: "reporting", label: "Reporting line", icon: GitBranch },
]

const EMPLOYMENT_TYPES = ["fulltime", "parttime", "contract", "intern"]
const STATUSES = ["active", "probation", "on_leave", "terminated", "resigned"]

function activeCount(f: OrgFilters): number {
  return [f.department, f.employmentType, f.status].filter(Boolean).length
}

const chipCls = (on: boolean) =>
  cn(
    "text-[11px] rounded-full px-2.5 py-1 border transition-colors",
    on
      ? "bg-accent-500 text-canvas border-accent-500"
      : "bg-surface-elevated/60 text-text-secondary border-border-subtle hover:text-text-primary",
  )

export function OrgChartControls({
  view,
  onViewChange,
  filters,
  onFiltersChange,
  departments,
  onSearchSelect,
  headcount,
  density,
  onDensityChange,
  showLevels,
  onToggleLevels,
  breadcrumbs,
  onCrumb,
}: OrgChartControlsProps) {
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<OrgSearchHit[]>([])
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const term = q.trim()
    if (!term) {
      setHits([])
      return
    }
    timer.current = setTimeout(() => {
      orgChartApi
        .search(term)
        .then(setHits)
        .catch(() => setHits([]))
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q])

  const term = q.trim().toLowerCase()
  const deptHits = term ? departments.filter((d) => d.name.toLowerCase().includes(term)) : []

  const pickPerson = (hit: OrgSearchHit) => {
    onSearchSelect(hit)
    setQ("")
    setHits([])
  }
  const pickDept = () => {
    onViewChange("department")
    setQ("")
    setHits([])
  }

  const count = activeCount(filters)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* icon segmented control */}
        <div className="inline-flex rounded-xl bg-surface-elevated/60 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-label={v.label}
              onClick={() => onViewChange(v.key)}
              className={cn(
                "inline-flex items-center gap-1.5 text-small rounded-lg px-2.5 py-1.5 transition-colors",
                view === v.key
                  ? "bg-accent-500/20 text-accent-100"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              <v.icon className="size-3.5" />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>

        {/* search */}
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people, roles, departments…"
            aria-label="Search organization"
            className="w-full h-8 rounded-lg bg-surface-elevated/60 border border-border-subtle pl-8 pr-2 text-small text-text-primary"
          />
          {(hits.length > 0 || deptHits.length > 0) && (
            <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto glass-surface rounded-xl py-1.5">
              {hits.length > 0 && (
                <>
                  <p className="px-3 py-1 text-[9px] tracking-wider text-text-tertiary">PEOPLE</p>
                  {hits.map((h) => {
                    const [from, to] = gradientFromName(h.full_name)
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => pickPerson(h)}
                        className="w-full flex items-center gap-2.5 text-left px-3 py-1.5 hover:bg-surface-elevated/60"
                      >
                        {h.photo_url ? (
                          <img
                            src={h.photo_url}
                            alt=""
                            className="size-6 rounded-full object-cover"
                          />
                        ) : (
                          <span
                            className={cn(
                              "size-6 rounded-full bg-gradient-to-br",
                              `from-${from}`,
                              `to-${to}`,
                            )}
                          />
                        )}
                        <span className="text-small text-text-primary">{h.full_name}</span>
                        {h.role_title && (
                          <span className="text-[11px] text-text-tertiary truncate">
                            · {h.role_title}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </>
              )}
              {deptHits.length > 0 && (
                <>
                  <p className="px-3 py-1 mt-1 text-[9px] tracking-wider text-text-tertiary">
                    DEPARTMENTS
                  </p>
                  {deptHits.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={pickDept}
                      className="w-full flex items-center gap-2.5 text-left px-3 py-1.5 hover:bg-surface-elevated/60"
                    >
                      <LayoutGrid className="size-4 text-text-tertiary" />
                      <span className="text-small text-text-primary">{d.name}</span>
                      <span className="text-[11px] text-text-tertiary">· {d.head_count}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* filters popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Filters"
              className={cn(
                "inline-flex items-center gap-1.5 h-8 rounded-lg border px-2.5 text-small",
                count > 0
                  ? "border-accent-500/60 text-accent-100"
                  : "border-border-subtle text-text-secondary",
              )}
            >
              <ListFilter className="size-4" /> Filters
              {count > 0 && (
                <span className="bg-accent-500 text-canvas font-bold rounded-full px-1.5 text-[10px]">
                  {count}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <FilterGroup label="Department">
              {departments.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  aria-label={d.name}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      department: filters.department === d.id ? null : d.id,
                    })
                  }
                  className={chipCls(filters.department === d.id)}
                >
                  {d.name}
                </button>
              ))}
            </FilterGroup>
            <FilterGroup label="Employment type">
              {EMPLOYMENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      employmentType: filters.employmentType === t ? null : t,
                    })
                  }
                  className={chipCls(filters.employmentType === t)}
                >
                  {t}
                </button>
              ))}
            </FilterGroup>
            <FilterGroup label="Status">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    onFiltersChange({ ...filters, status: filters.status === s ? null : s })
                  }
                  className={chipCls(filters.status === s)}
                >
                  {s.replace(/_/g, " ")}
                </button>
              ))}
            </FilterGroup>
            {hasActiveFilters(filters) && (
              <button
                type="button"
                onClick={() =>
                  onFiltersChange({ department: null, employmentType: null, status: null })
                }
                className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary"
              >
                <X className="size-3.5" /> Clear all
              </button>
            )}
          </PopoverContent>
        </Popover>

        {/* density toggle */}
        <div className="inline-flex rounded-lg bg-surface-elevated/60 p-0.5">
          {(["comfortable", "compact"] as CardDensity[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDensityChange(d)}
              className={cn(
                "text-[11px] rounded-md px-2 py-1 capitalize",
                density === d ? "bg-accent-500/20 text-accent-100" : "text-text-secondary",
              )}
            >
              {d}
            </button>
          ))}
        </div>

        {/* level labels toggle */}
        <button
          type="button"
          onClick={onToggleLevels}
          aria-pressed={showLevels}
          className={cn(
            "h-8 rounded-lg border px-2.5 text-[11px]",
            showLevels
              ? "border-accent-500/60 text-accent-100"
              : "border-border-subtle text-text-secondary",
          )}
        >
          Levels
        </button>

        <div className="ml-auto text-[11px] text-text-tertiary">
          {headcount.people} people · {headcount.departments} departments
        </div>
      </div>

      {breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-small">
          <button
            type="button"
            onClick={() => onCrumb(null)}
            className="text-text-secondary hover:text-text-primary"
          >
            Top
          </button>
          {breadcrumbs.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              <ChevronRight className="size-3.5 text-text-tertiary" />
              <button
                type="button"
                onClick={() => onCrumb(c.id)}
                className="text-text-secondary hover:text-text-primary"
              >
                {c.label}
              </button>
            </span>
          ))}
        </nav>
      )}
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] tracking-wider text-text-tertiary mb-1.5">{label.toUpperCase()}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}
