import { ChevronRight, Maximize, Minus, Plus, Search, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

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
  zoom: { pct: number; in: () => void; out: () => void; fit: () => void }
  breadcrumbs: Crumb[]
  onCrumb: (id: string | null) => void
}

const VIEWS: { key: OrgView; label: string }[] = [
  { key: "tree", label: "Tree" },
  { key: "department", label: "Department" },
  { key: "reporting", label: "Reporting line" },
]

const EMPLOYMENT_TYPES = ["fulltime", "parttime", "contract", "intern"]
const STATUSES = ["active", "probation", "on_leave", "terminated", "resigned"]

const selectCls =
  "h-8 rounded-lg bg-surface-elevated/60 border border-border-subtle text-small text-text-secondary px-2"

export function OrgChartControls({
  view,
  onViewChange,
  filters,
  onFiltersChange,
  departments,
  onSearchSelect,
  zoom,
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

  const pick = (hit: OrgSearchHit) => {
    onSearchSelect(hit)
    setQ("")
    setHits([])
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-surface-elevated/60 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => onViewChange(v.key)}
              className={cn(
                "text-small rounded-lg px-3 py-1.5 transition-colors",
                view === v.key
                  ? "bg-accent-500/20 text-accent-100"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people, roles, departments…"
            aria-label="Search organization"
            className="w-full h-8 rounded-lg bg-surface-elevated/60 border border-border-subtle pl-8 pr-2 text-small text-text-primary"
          />
          {hits.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto glass-surface rounded-xl py-1">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => pick(h)}
                    className="w-full text-left px-3 py-1.5 hover:bg-surface-elevated/60"
                  >
                    <span className="text-small text-text-primary">{h.full_name}</span>
                    {h.role_title && (
                      <span className="text-[11px] text-text-tertiary"> · {h.role_title}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {view !== "department" && (
          <div className="inline-flex items-center gap-1 ml-auto">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={zoom.out}
              className="size-8 grid place-items-center rounded-lg bg-surface-elevated/60 text-text-secondary"
            >
              <Minus className="size-4" />
            </button>
            <span className="text-[11px] text-text-tertiary w-10 text-center tabular-nums">
              {zoom.pct}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={zoom.in}
              className="size-8 grid place-items-center rounded-lg bg-surface-elevated/60 text-text-secondary"
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Fit to view"
              onClick={zoom.fit}
              className="size-8 grid place-items-center rounded-lg bg-surface-elevated/60 text-text-secondary"
            >
              <Maximize className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={selectCls}
          aria-label="Filter by department"
          value={filters.department ?? ""}
          onChange={(e) => onFiltersChange({ ...filters, department: e.target.value || null })}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          aria-label="Filter by employment type"
          value={filters.employmentType ?? ""}
          onChange={(e) => onFiltersChange({ ...filters, employmentType: e.target.value || null })}
        >
          <option value="">All types</option>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          aria-label="Filter by status"
          value={filters.status ?? ""}
          onChange={(e) => onFiltersChange({ ...filters, status: e.target.value || null })}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        {hasActiveFilters(filters) && (
          <button
            type="button"
            onClick={() =>
              onFiltersChange({ department: null, employmentType: null, status: null })
            }
            className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary"
          >
            <X className="size-3.5" /> Clear
          </button>
        )}
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
