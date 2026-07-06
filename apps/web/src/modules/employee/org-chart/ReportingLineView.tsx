import { useQuery } from "@tanstack/react-query"
import { AlertCircle, Search } from "lucide-react"

import { EmptyState } from "@/components/hrms"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { employeeApi } from "@/modules/employee/api"

import { CanvasControls } from "./CanvasControls"
import { OrgNodeCard } from "./OrgNodeCard"
import { orgChartApi } from "./api"
import type { OrgNode } from "./types"
import { useZoomPan } from "./useZoomPan"

export interface ReportingLineViewProps {
  focusId: string | null
  onFocus: (id: string) => void
}

export function ReportingLineView({ focusId, onFocus }: ReportingLineViewProps) {
  // Own viewport — independent from the Tree view so a pan/zoom there never
  // pushes this spine off-screen.
  const zoom = useZoomPan()
  const chainQ = useQuery({
    queryKey: ["report-chain", focusId],
    queryFn: () => employeeApi.getReportingChain(focusId as string),
    enabled: !!focusId,
  })
  const focusedQ = useQuery({
    queryKey: ["employee", focusId],
    queryFn: () => employeeApi.retrieve(focusId as string),
    enabled: !!focusId,
  })
  const reportsQ = useQuery({
    queryKey: ["org-children", focusId],
    queryFn: () => orgChartApi.children(focusId as string),
    enabled: !!focusId,
  })

  if (!focusId) {
    return (
      <EmptyState
        icon={<Search className="size-6" />}
        title="Pick a person to trace their reporting line"
        description="Search above or use “Focus subtree” from any card to centre the view on someone."
      />
    )
  }
  if (chainQ.isLoading || focusedQ.isLoading) {
    return <Skeleton className="h-64 rounded-2xl" />
  }
  if (focusedQ.isError || !focusedQ.data) {
    return (
      <EmptyState
        icon={<AlertCircle className="size-6" />}
        title="Couldn't load this person"
        description="The employee record could not be fetched."
        action={
          <Button type="button" onClick={() => focusedQ.refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  // reporting-chain returns nearest-manager-first; reverse so the root sits on top.
  const ancestors = [...(chainQ.data ?? [])].reverse()
  const reports = reportsQ.data ?? []
  const emp = focusedQ.data
  const focusedNode: OrgNode = {
    id: emp.id,
    full_name: emp.full_name,
    email: emp.email ?? null,
    role_title: emp.role_title ?? null,
    department_id: emp.department_id ?? null,
    department_name: emp.department_name ?? null,
    employment_type: emp.employment_type ?? null,
    status: emp.status ?? null,
    photo_url: emp.photo_url ?? null,
    manager: emp.manager ?? null,
    manager_name: null,
    direct_reports_count: reports.length,
    has_reports: reports.length > 0,
  }

  return (
    <div
      className="relative h-[calc(100vh-16rem)] overflow-auto rounded-2xl bg-black/10"
      onWheel={(e) => {
        if (e.ctrlKey) zoom.zoomAt(e.deltaY)
      }}
    >
      <div
        className="flex flex-col items-center gap-0 p-8 origin-top"
        style={{ transform: zoom.transform, transition: "none" }}
      >
        {ancestors.map((a) => (
          <div key={a.id} className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => onFocus(a.id)}
              className="glass-surface rounded-xl px-3 py-2 opacity-60 hover:opacity-100 transition-opacity"
            >
              <span className="text-small text-text-primary">{a.full_name}</span>
              {a.role_title && (
                <span className="text-[11px] text-text-tertiary"> · {a.role_title}</span>
              )}
            </button>
            <div className="h-5 w-px bg-border-subtle" />
          </div>
        ))}

        <div className="ring-2 ring-accent-500/40 rounded-2xl">
          <OrgNodeCard node={focusedNode} expanded onFocus={onFocus} />
        </div>

        {reports.length > 0 && (
          <>
            <div className="h-5 w-px bg-border-subtle" />
            <div className="flex flex-wrap justify-center gap-4 border-t border-border-subtle pt-5">
              {reports.map((r) => (
                <OrgNodeCard key={r.id} node={r} onFocus={onFocus} />
              ))}
            </div>
          </>
        )}
      </div>

      <CanvasControls pct={zoom.pct} onIn={zoom.zoomIn} onOut={zoom.zoomOut} onFit={zoom.fit} />
    </div>
  )
}
