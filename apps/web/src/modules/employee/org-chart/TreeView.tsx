import { useQuery } from "@tanstack/react-query"
import { AlertCircle, Network } from "lucide-react"
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { EmptyState } from "@/components/hrms"
import { Button } from "@/components/ui/button"
import { CanvasControls } from "./CanvasControls"
import { Connectors } from "./Connectors"
import { Minimap } from "./Minimap"
import { type CardDensity, OrgNodeCard } from "./OrgNodeCard"
import { TreeSkeleton } from "./TreeSkeleton"
import { orgChartApi } from "./api"
import { contentBounds } from "./minimap-math"
import { type OrgFilters, hasActiveFilters, matchesFilters } from "./org-chart-filters"
import type { OrgNode } from "./types"
import { edgesFromBoxes, useCanvasLayout } from "./useCanvasLayout"
import { useOrgTree } from "./useOrgTree"
import type { useZoomPan } from "./useZoomPan"

export type ZoomPanApi = ReturnType<typeof useZoomPan>

const DENSE_THRESHOLD = 12

export interface TreeViewProps {
  filters: OrgFilters
  zoom: ZoomPanApi
  onFocus: (id: string) => void
  expandTo?: string[]
  highlightId?: string | null
  density?: CardDensity
  showLevels?: boolean
  highlightPath?: string[]
}

export function TreeView({
  filters,
  zoom,
  onFocus,
  expandTo,
  highlightId,
  density = "comfortable",
  showLevels = false,
  highlightPath,
}: TreeViewProps) {
  const tree = useOrgTree()
  const { register, boxes, recompute } = useCanvasLayout()
  const parentOf = useRef<Record<string, string>>({})
  const contentRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [container, setContainer] = useState({ w: 0, h: 0 })
  const rootsQ = useQuery({ queryKey: ["org-roots"], queryFn: orgChartApi.roots })

  useEffect(() => {
    if (expandTo && expandTo.length > 0) tree.expandPath(expandTo)
  }, [expandTo, tree.expandPath])

  const schedule = useCallback(() => {
    if (typeof requestAnimationFrame === "undefined") {
      recompute()
      return
    }
    requestAnimationFrame(() => recompute())
  }, [recompute])

  const linkParent = useCallback(
    (childId: string, parent: string) => {
      parentOf.current[childId] = parent
      schedule()
    },
    [schedule],
  )

  // Recompute geometry when the tree shape or density changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tree.expanded/rootsQ.data drive layout
  useEffect(() => {
    schedule()
  }, [tree.expanded, density, rootsQ.data, schedule])

  // Track viewport + content size for the minimap + connector canvas.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      if (viewportRef.current) {
        setContainer({ w: viewportRef.current.clientWidth, h: viewportRef.current.clientHeight })
      }
      schedule()
    })
    if (viewportRef.current) ro.observe(viewportRef.current)
    if (contentRef.current) ro.observe(contentRef.current)
    return () => ro.disconnect()
  }, [schedule])

  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const onPointerDown = (e: PointerEvent) => {
    if (e.target !== e.currentTarget) return
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

  if (rootsQ.isLoading) return <TreeSkeleton />
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
        title="No reporting lines yet"
        description="Set a manager on employee profiles to build the chart."
        action={
          <Button asChild>
            <Link to="/admin/people">Open Directory</Link>
          </Button>
        }
      />
    )
  }

  const bounds = contentBounds(boxes)
  const edges = edgesFromBoxes(boxes, parentOf.current)

  return (
    <div
      ref={viewportRef}
      className="relative h-[calc(100vh-17rem)] overflow-hidden rounded-2xl bg-black/10 cursor-grab active:cursor-grabbing [background-image:radial-gradient(rgb(255_255_255/0.05)_1px,transparent_1px)] [background-size:16px_16px]"
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
        <div ref={contentRef} className="relative -translate-x-1/2">
          {boxes.length > 0 && <Connectors edges={edges} width={bounds.w} height={bounds.h} />}
          <div className="flex items-start gap-10">
            {roots.map((r) => (
              <Branch
                key={r.id}
                node={r}
                density={density}
                tree={tree}
                filters={filters}
                highlightId={highlightId}
                highlightPath={highlightPath}
                onFocus={onFocus}
                register={register}
                linkParent={linkParent}
              />
            ))}
          </div>
        </div>
      </div>

      {showLevels && (
        <div className="pointer-events-none absolute left-2 top-2 text-[10px] tracking-wider text-text-tertiary/70">
          LEVELS ON
        </div>
      )}

      <CanvasControls pct={zoom.pct} onIn={zoom.zoomIn} onOut={zoom.zoomOut} onFit={zoom.fit} />
      <Minimap
        boxes={boxes}
        container={container}
        scale={zoom.scale}
        tx={zoom.tx}
        ty={zoom.ty}
        onPan={zoom.setPan}
      />
    </div>
  )
}

interface BranchProps {
  node: OrgNode
  density: CardDensity
  tree: ReturnType<typeof useOrgTree>
  filters: OrgFilters
  highlightId?: string | null
  highlightPath?: string[]
  onFocus: (id: string) => void
  register: (id: string, el: HTMLElement | null) => void
  linkParent: (childId: string, parent: string) => void
}

function Branch({
  node,
  density,
  tree,
  filters,
  highlightId,
  highlightPath,
  onFocus,
  register,
  linkParent,
}: BranchProps) {
  const expanded = tree.isExpanded(node.id)
  const boxRef = useRef<HTMLDivElement>(null)
  const childrenQ = useQuery({
    queryKey: ["org-children", node.id],
    queryFn: () => orgChartApi.children(node.id),
    enabled: expanded && node.has_reports,
  })
  const kids = childrenQ.data ?? []

  useEffect(() => {
    register(node.id, boxRef.current)
    return () => register(node.id, null)
  }, [register, node.id])

  useEffect(() => {
    for (const c of kids) linkParent(c.id, node.id)
  }, [kids, node.id, linkParent])

  useEffect(() => {
    if (highlightId === node.id)
      boxRef.current?.scrollIntoView({ block: "center", inline: "center" })
  }, [highlightId, node.id])

  const filterDim = hasActiveFilters(filters) && !matchesFilters(node, filters)
  const pathDim = !!highlightPath && highlightPath.length > 0 && !highlightPath.includes(node.id)
  const childDensity: CardDensity =
    density === "compact" || kids.length > DENSE_THRESHOLD ? "compact" : "comfortable"

  return (
    <div className="flex flex-col items-center">
      <div ref={boxRef}>
        <OrgNodeCard
          node={node}
          density={density}
          expanded={expanded}
          dimmed={filterDim || pathDim}
          highlighted={highlightId === node.id}
          onToggle={tree.toggle}
          onFocus={onFocus}
        />
      </div>

      {expanded && node.has_reports && childrenQ.isLoading && (
        <div className="mt-8 h-10 w-24 animate-pulse rounded-lg bg-surface-elevated/40" />
      )}
      {expanded && childrenQ.isError && (
        <button
          type="button"
          onClick={() => childrenQ.refetch()}
          className="mt-6 text-[11px] text-coral hover:underline"
        >
          Failed to load reports — retry
        </button>
      )}

      {expanded && kids.length > 0 && (
        <div
          className={
            childDensity === "compact"
              ? "mt-12 flex max-w-[860px] flex-wrap justify-center gap-3"
              : "mt-12 flex items-start gap-10"
          }
        >
          {kids.map((c) => (
            <Branch
              key={c.id}
              node={c}
              density={childDensity}
              tree={tree}
              filters={filters}
              highlightId={highlightId}
              highlightPath={highlightPath}
              onFocus={onFocus}
              register={register}
              linkParent={linkParent}
            />
          ))}
        </div>
      )}
    </div>
  )
}
