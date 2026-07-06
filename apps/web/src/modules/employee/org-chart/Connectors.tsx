import type { Edge } from "./useCanvasLayout"

/** SVG overlay (content coordinates) drawing a smooth cubic from each parent
 * bottom-centre to each child top-centre. Sized to the content layer. */
export function Connectors({
  edges,
  width,
  height,
}: {
  edges: Edge[]
  width: number
  height: number
}) {
  const path = (e: Edge) => {
    const x1 = e.from.x + e.from.w / 2
    const y1 = e.from.y + e.from.h
    const x2 = e.to.x + e.to.w / 2
    const y2 = e.to.y
    const my = (y1 + y2) / 2
    return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
  }
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      width={width}
      height={height}
      aria-hidden
    >
      <title>Reporting connectors</title>
      {edges.map((e) => (
        <path
          key={`${e.from.id}-${e.to.id}`}
          d={path(e)}
          className="stroke-border-subtle"
          strokeWidth={1.5}
          fill="none"
        />
      ))}
    </svg>
  )
}
