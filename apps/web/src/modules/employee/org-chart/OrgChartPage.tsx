import { useQuery } from "@tanstack/react-query"
import { useCallback, useState } from "react"

import { PageHeader } from "@/components/shell/PageHeader"

import { DepartmentView } from "./DepartmentView"
import { type Crumb, OrgChartControls, type OrgView } from "./OrgChartControls"
import { ReportingLineView } from "./ReportingLineView"
import { TreeView } from "./TreeView"
import { orgChartApi } from "./api"
import { EMPTY_FILTERS, type OrgFilters } from "./org-chart-filters"
import type { OrgSearchHit } from "./types"
import { useZoomPan } from "./useZoomPan"

export default function OrgChartPage() {
  const [view, setView] = useState<OrgView>("tree")
  const [filters, setFilters] = useState<OrgFilters>(EMPTY_FILTERS)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [expandTo, setExpandTo] = useState<string[]>([])
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([])
  const zoom = useZoomPan()

  const departmentsQ = useQuery({ queryKey: ["org-depts"], queryFn: orgChartApi.departments })

  const onSearchSelect = useCallback((hit: OrgSearchHit) => {
    setView("tree")
    setExpandTo(hit.ancestor_ids)
    setHighlightId(hit.id)
  }, [])

  const onFocus = useCallback((id: string, label?: string) => {
    setFocusId(id)
    setView("reporting")
    setBreadcrumbs((prev) => {
      if (prev.some((c) => c.id === id)) return prev
      return [...prev, { id, label: label ?? "Selected" }]
    })
  }, [])

  const onCrumb = useCallback((id: string | null) => {
    if (id === null) {
      setFocusId(null)
      setBreadcrumbs([])
      setView("tree")
      return
    }
    setFocusId(id)
    setView("reporting")
    setBreadcrumbs((prev) => {
      const idx = prev.findIndex((c) => c.id === id)
      return idx >= 0 ? prev.slice(0, idx + 1) : prev
    })
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Organization Chart"
        subtitle="Explore the company's reporting structure."
      />

      <OrgChartControls
        view={view}
        onViewChange={setView}
        filters={filters}
        onFiltersChange={setFilters}
        departments={departmentsQ.data ?? []}
        onSearchSelect={onSearchSelect}
        zoom={{ pct: zoom.pct, in: zoom.zoomIn, out: zoom.zoomOut, fit: zoom.fit }}
        breadcrumbs={breadcrumbs}
        onCrumb={onCrumb}
      />

      {view === "tree" && (
        <TreeView
          filters={filters}
          zoom={zoom}
          onFocus={(id) => onFocus(id)}
          expandTo={expandTo}
          highlightId={highlightId}
        />
      )}
      {view === "department" && <DepartmentView filters={filters} onFocus={(id) => onFocus(id)} />}
      {view === "reporting" && (
        <ReportingLineView focusId={focusId} zoom={zoom} onFocus={(id) => onFocus(id)} />
      )}
    </div>
  )
}
