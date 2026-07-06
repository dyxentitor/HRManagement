import { useQuery } from "@tanstack/react-query"
import { AlertCircle, Network } from "lucide-react"
import { type PointerEvent, useEffect, useRef } from "react"

import { EmptyState } from "@/components/hrms"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { OrgNodeCard } from "./OrgNodeCard"
import { orgChartApi } from "./api"
import { type OrgFilters, hasActiveFilters, matchesFilters } from "./org-chart-filters"
import type { OrgNode } from "./types"
import { useOrgTree } from "./useOrgTree"
import type { useZoomPan } from "./useZoomPan"

export type ZoomPanApi = ReturnType<typeof useZoomPan>

const OUTLINE_THRESHOLD = 12

export interface TreeViewProps {
  filters: OrgFilters
  zoom: ZoomPanApi
  onFocus: (id: string) => void
  expandTo?: string[]
  highlightId?: string | null
}

export function TreeView({ filters, zoom, onFocus, expandTo, highlightId }: TreeViewProps) {
  const tree = useOrgTree()
  const rootsQ = useQuery({ queryKey: ["org-roots"], queryFn: orgChartApi.roots })

  // Auto-expand along a search hit's ancestor path.
  useEffect(() => {
    if (expandTo && expandTo.length > 0) tree.expandPath(expandTo)
  }, [expandTo, tree.expandPath])

  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const onPointerDown = (e: PointerEvent) => {
    if (e.target !== e.currentTarget) return // only drag from the backdrop
    drag.current = { x: e.clientX, y: e.clientY, tx: zoom.tx, ty: zoom.ty }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return
    zoom.setPan(
      drag.current.tx + (e.clientX - drag.current.x),
      drag.current.ty + (e.clientY - drag.current.y),
    )
  }
  const endDrag = () => {
    drag.current = null
  }

  if (rootsQ.isLoading) {
    return (
      <div className="flex gap-6 p-8">
        <Skeleton className="h-28 w-[248px] rounded-2xl" />
        <Skeleton className="h-28 w-[248px] rounded-2xl" />
      </div>
    )
  }
  if (rootsQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle className="size-6" />}
        title="Couldn't load the organization chart"
        description="Something went wrong fetching the hierarchy."
        action={
          <Button type="button" onClick={() => rootsQ.refetch()}>
            Retry
          </Button>
        }
      />
    )
  }
  const roots = rootsQ.data ?? []
  if (roots.length === 0) {
    return (
      <EmptyState
        icon={<Network className="size-6" />}
        title="No hierarchy yet"
        description="No employees have been added, or none are at the top of the reporting line."
      />
    )
  }

  return (
    <div
      className="relative h-[calc(100vh-16rem)] overflow-hidden rounded-2xl bg-black/10 cursor-grab active:cursor-grabbing"
      onWheel={(e) => zoom.zoomAt(e.deltaY)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <div
        className="absolute left-1/2 top-8 origin-top will-change-transform"
        style={{ transform: zoom.transform, transition: "none" }}
      >
        <div className="flex -translate-x-1/2 items-start gap-8">
          {roots.map((r) => (
            <Branch
              key={r.id}
              node={r}
              tree={tree}
              filters={filters}
              highlightId={highlightId}
              onFocus={onFocus}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface BranchProps {
  node: OrgNode
  tree: ReturnType<typeof useOrgTree>
  filters: OrgFilters
  highlightId?: string | null
  onFocus: (id: string) => void
}

function Branch({ node, tree, filters, highlightId, onFocus }: BranchProps) {
  const expanded = tree.isExpanded(node.id)
  const ref = useRef<HTMLDivElement>(null)
  const childrenQ = useQuery({
    queryKey: ["org-children", node.id],
    queryFn: () => orgChartApi.children(node.id),
    enabled: expanded && node.has_reports,
  })

  useEffect(() => {
    if (highlightId === node.id) ref.current?.scrollIntoView({ block: "center", inline: "center" })
  }, [highlightId, node.id])

  const dimmed = hasActiveFilters(filters) && !matchesFilters(node, filters)
  const kids = childrenQ.data ?? []
  const stack = kids.length > OUTLINE_THRESHOLD

  return (
    <div className="flex flex-col items-center" ref={ref}>
      <OrgNodeCard
        node={node}
        expanded={expanded}
        dimmed={dimmed}
        highlighted={highlightId === node.id}
        onToggle={tree.toggle}
        onFocus={onFocus}
      />

      {expanded && node.has_reports && childrenQ.isLoading && (
        <Skeleton className="mt-4 h-20 w-[248px] rounded-2xl" />
      )}
      {expanded && childrenQ.isError && (
        <button
          type="button"
          onClick={() => childrenQ.refetch()}
          className="mt-3 text-[11px] text-coral hover:underline"
        >
          Failed to load reports — retry
        </button>
      )}

      {expanded && kids.length > 0 && !stack && (
        <div className="flex flex-col items-center">
          <div className="h-5 w-px bg-border-subtle" />
          <div className="flex items-start gap-8 border-t border-border-subtle pt-5">
            {kids.map((c) => (
              <div key={c.id} className="-mt-5 flex flex-col items-center">
                <div className="h-5 w-px bg-border-subtle" />
                <Branch
                  node={c}
                  tree={tree}
                  filters={filters}
                  highlightId={highlightId}
                  onFocus={onFocus}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {expanded && kids.length > 0 && stack && (
        <div className="mt-4 flex flex-col gap-3 border-l border-border-subtle pl-5">
          {kids.map((c) => (
            <Branch
              key={c.id}
              node={c}
              tree={tree}
              filters={filters}
              highlightId={highlightId}
              onFocus={onFocus}
            />
          ))}
        </div>
      )}
    </div>
  )
}
